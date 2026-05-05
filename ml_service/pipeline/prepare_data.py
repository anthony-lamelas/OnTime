"""
ml_service/pipeline/prepare_data.py

Data preparation script for the data science team.
Run this when new raw parquet_daily data arrives to produce
aggregated final_data/ parquet files ready for retraining.

Prerequisites:
  - parquet_daily/  : daily stop-level parquet files (*_part2.parquet)
  - gtfs/           : versioned GTFS folders (gtfs/2024-12-12/, gtfs/2025-1-16/, etc.)

Run from ml_service/ directory:
    python -m pipeline.prepare_data

After this completes, run:
    python -m pipeline.retrain --skip-fetch
"""

import os
import re
import glob
from collections import defaultdict
from datetime import datetime, timedelta, date
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

# ── Paths ─────────────────────────────────────────────────────────────────────
ML_SERVICE_DIR = Path(__file__).parent.parent
PARQUET_DIR    = ML_SERVICE_DIR / "data" / "parquet_daily"
GTFS_ROOT      = ML_SERVICE_DIR / "data" / "gtfs"
CLEAN_DIR      = ML_SERVICE_DIR / "data" / "clean_parquet"
FINAL_DIR      = ML_SERVICE_DIR / "data" / "final_data"

NY  = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")

TOLERANCE_MIN = 12
MIN_COUNT     = 4   # minimum observations to include a row

KEYS = ["route_id", "stop_id", "event_kind", "service_date"]

KEY_COLS = [
    "route_name", "direction", "stop_id",
    "stop_name", "stop_sequence", "hour"
]

GTFS_CACHE: dict = {}


# ── GTFS helpers ──────────────────────────────────────────────────────────────

def load_gtfs_tables(gtfs_dir: str) -> dict:
    if gtfs_dir in GTFS_CACHE:
        return GTFS_CACHE[gtfs_dir]

    stop_times = pd.read_csv(
        os.path.join(gtfs_dir, "stop_times.txt"),
        dtype={"trip_id": str, "stop_id": str,
               "arrival_time": str, "departure_time": str}
    )
    trips = pd.read_csv(
        os.path.join(gtfs_dir, "trips.txt"),
        dtype={"trip_id": str, "route_id": str, "service_id": str}
    )
    calendar_df = pd.read_csv(
        os.path.join(gtfs_dir, "calendar.txt"),
        dtype={"service_id": str, "start_date": str, "end_date": str}
    )
    cal_dates_path = os.path.join(gtfs_dir, "calendar_dates.txt")
    calendar_dates_df = (
        pd.read_csv(cal_dates_path,
                    dtype={"service_id": str, "date": str, "exception_type": str})
        if os.path.exists(cal_dates_path) else None
    )
    stops = pd.read_csv(os.path.join(gtfs_dir, "stops.txt"), dtype=str)
    st = stop_times.merge(
        trips[["trip_id", "route_id", "service_id"]], on="trip_id", how="inner"
    )
    GTFS_CACHE[gtfs_dir] = {
        "st": st,
        "calendar_df": calendar_df,
        "calendar_dates_df": calendar_dates_df,
        "stops": stops,
    }
    return GTFS_CACHE[gtfs_dir]


def read_gtfs_range(gtfs_dir: str) -> tuple[date, date]:
    cal = pd.read_csv(os.path.join(gtfs_dir, "calendar.txt"), dtype=str)
    start = datetime.strptime(str(cal["start_date"].min()), "%Y%m%d").date()
    end   = datetime.strptime(str(cal["end_date"].max()), "%Y%m%d").date()
    return start, end


def build_gtfs_index() -> pd.DataFrame:
    rows = []
    for folder in sorted(os.listdir(GTFS_ROOT)):
        gtfs_dir = os.path.join(GTFS_ROOT, folder)
        if not os.path.isdir(gtfs_dir):
            continue
        if not os.path.exists(os.path.join(gtfs_dir, "calendar.txt")):
            continue
        s, e = read_gtfs_range(gtfs_dir)
        rows.append({"start": s, "end": e, "dir": gtfs_dir})
    return pd.DataFrame(rows).sort_values(["start", "end"]).reset_index(drop=True)


def pick_gtfs_for_day(d: date, gtfs_index: pd.DataFrame) -> str | None:
    cand = gtfs_index[(gtfs_index["start"] <= d) & (d <= gtfs_index["end"])].copy()
    if cand.empty:
        return None
    best = cand.sort_values(["start", "end"], ascending=[False, False]).iloc[0]
    return best["dir"]


def service_ids_for_date(
    calendar_df: pd.DataFrame,
    calendar_dates_df: pd.DataFrame | None,
    d: date
) -> set[str]:
    ymd = int(d.strftime("%Y%m%d"))
    weekday_col = ["monday","tuesday","wednesday","thursday",
                   "friday","saturday","sunday"][d.weekday()]
    cal = calendar_df.copy()
    cal["start_date"] = cal["start_date"].astype(int)
    cal["end_date"]   = cal["end_date"].astype(int)
    active = cal[
        (cal["start_date"] <= ymd) &
        (cal["end_date"]   >= ymd) &
        (cal[weekday_col].astype(int) == 1)
    ]["service_id"]
    active_set = set(active.tolist())
    if calendar_dates_df is not None and len(calendar_dates_df) > 0:
        cd = calendar_dates_df.copy()
        cd["date"] = cd["date"].astype(int)
        todays  = cd[cd["date"] == ymd][["service_id","exception_type"]]
        added   = set(todays[todays["exception_type"].astype(int) == 1]["service_id"])
        removed = set(todays[todays["exception_type"].astype(int) == 2]["service_id"])
        active_set |= added
        active_set -= removed
    return active_set


# ── Matching helpers ──────────────────────────────────────────────────────────

def groupwise_asof(
    left_df: pd.DataFrame,
    right_df: pd.DataFrame,
    tol: pd.Timedelta
) -> pd.DataFrame:
    right_groups = {}
    for k, g in right_df.groupby(KEYS, sort=False):
        right_groups[k] = g.sort_values("scheduled_dt").reset_index(drop=True)

    out = []
    for k, g in left_df.groupby(KEYS, sort=False):
        g = g.sort_values("actual_dt").reset_index(drop=True)
        rg = right_groups.get(k)
        if rg is None or rg.empty:
            gg = g.copy()
            gg["scheduled_dt"]  = pd.NaT
            gg["trip_id"]       = pd.NA
            gg["stop_sequence"] = pd.NA
            out.append(gg)
            continue
        m = pd.merge_asof(
            g, rg,
            left_on="actual_dt",
            right_on="scheduled_dt",
            tolerance=tol,
            direction="nearest",
            allow_exact_matches=True,
            suffixes=("", "_sched"),
        )
        out.append(m)
    return pd.concat(out, ignore_index=True)


# ── Per-day processing ────────────────────────────────────────────────────────

def safe_unix_to_dt(ser: pd.Series, tz) -> pd.Series:
    arr = pd.to_numeric(ser, errors="coerce").replace([np.inf, -np.inf], np.nan)
    max_s  = pd.Timestamp.max.value / 1e9
    min_s  = pd.Timestamp.min.value / 1e9
    max_ms = max_s * 1000.0
    min_ms = min_s * 1000.0
    absarr  = arr.abs()
    ms_mask = absarr > 1e11
    out = pd.Series(pd.NaT, index=arr.index, dtype="datetime64[ns, UTC]")
    s    = arr.where(~ms_mask)
    s_ok = s.notna() & (s >= min_s) & (s <= max_s)
    with np.errstate(over="ignore", invalid="ignore"):
        out.loc[s_ok] = pd.to_datetime(s.loc[s_ok], unit="s", utc=True, errors="coerce")
    ms    = arr.where(ms_mask)
    ms_ok = ms.notna() & (ms >= min_ms) & (ms <= max_ms)
    with np.errstate(over="ignore", invalid="ignore"):
        out.loc[ms_ok] = pd.to_datetime(ms.loc[ms_ok], unit="ms", utc=True, errors="coerce")
    return out.dt.tz_convert(tz)


def parse_gtfs_time_vectorized(time_str_series: pd.Series) -> pd.Series:
    valid_mask = time_str_series.notna() & (time_str_series != "")
    result = pd.Series(index=time_str_series.index, dtype="timedelta64[ns]")
    if valid_mask.any():
        parts        = time_str_series[valid_mask].str.split(":", expand=True).astype(int)
        total_secs   = parts[0] * 3600 + parts[1] * 60 + parts[2]
        result[valid_mask] = pd.to_timedelta(total_secs, unit="s")
    return result


def process_one_day(
    actual_parquet_path: str,
    gtfs: dict,
    tolerance_min: int = 12
) -> pd.DataFrame:
    tol = pd.Timedelta(minutes=tolerance_min)

    actual = pd.read_parquet(actual_parquet_path)[
        ["trip_uid", "stop_id", "arrival_time", "departure_time"]
    ].copy()

    route_parts     = actual["trip_uid"].astype(str).str.split("_", n=1, expand=True)
    actual["route_id"] = ""
    if len(route_parts.columns) > 1:
        actual["route_id"] = (
            route_parts[1].str.split(".", n=1, expand=True)[0].fillna("")
        )

    actual["actual_arr_dt"] = safe_unix_to_dt(actual["arrival_time"],   NY)
    actual["actual_dep_dt"] = safe_unix_to_dt(actual["departure_time"], NY)

    arr = actual[actual["actual_arr_dt"].notna()].copy()
    arr["event_kind"] = "arrival"
    arr["actual_dt"]  = arr["actual_arr_dt"]

    dep = actual[actual["actual_dep_dt"].notna()].copy()
    dep["event_kind"] = "departure"
    dep["actual_dt"]  = dep["actual_dep_dt"]

    actual_events = pd.concat([arr, dep], ignore_index=True)[
        ["trip_uid","route_id","stop_id","event_kind","actual_dt"]
    ]
    actual_events["service_date_0"] = actual_events["actual_dt"].dt.date
    actual_events["service_date_1"] = actual_events["service_date_0"].apply(
        lambda d: d - timedelta(days=1)
    )

    dates_needed = (
        set(actual_events["service_date_0"]) |
        set(actual_events["service_date_1"])
    )

    st                = gtfs["st"]
    calendar_df       = gtfs["calendar_df"]
    calendar_dates_df = gtfs["calendar_dates_df"]
    stops             = gtfs["stops"]

    sched_frames = []
    for d in sorted(dates_needed):
        active_sids = service_ids_for_date(calendar_df, calendar_dates_df, d)
        st_d = st[st["service_id"].isin(active_sids)].copy()
        if st_d.empty:
            continue
        base_dt = datetime(d.year, d.month, d.day, tzinfo=NY)

        sarr = st_d.copy()
        sarr["event_kind"]    = "arrival"
        sarr["scheduled_dt"]  = base_dt + parse_gtfs_time_vectorized(st_d["arrival_time"])
        sarr = sarr[sarr["scheduled_dt"].notna()]

        sdep = st_d.copy()
        sdep["event_kind"]    = "departure"
        sdep["scheduled_dt"]  = base_dt + parse_gtfs_time_vectorized(st_d["departure_time"])
        sdep = sdep[sdep["scheduled_dt"].notna()]

        sched = pd.concat([sarr, sdep], ignore_index=True)
        sched["service_date"] = d
        sched_frames.append(
            sched[["service_date","route_id","trip_id",
                   "stop_id","stop_sequence","event_kind","scheduled_dt"]]
        )

    if not sched_frames:
        return pd.DataFrame()

    schedule_events = pd.concat(sched_frames, ignore_index=True)
    schedule_events["service_date"] = pd.to_datetime(
        schedule_events["service_date"]
    ).dt.date

    right = schedule_events.copy()
    right["scheduled_dt"] = pd.to_datetime(right["scheduled_dt"])

    left0 = actual_events.rename(columns={"service_date_0": "service_date"}).copy()
    left0["service_date"] = pd.to_datetime(left0["service_date"]).dt.date
    left0["actual_dt"]    = pd.to_datetime(left0["actual_dt"])

    m0 = groupwise_asof(left0, right, tol)
    m0["matched_using"] = "service_date_0"

    if m0["scheduled_dt"].isna().any():
        left1 = actual_events.rename(columns={"service_date_1": "service_date"}).copy()
        left1["service_date"] = pd.to_datetime(left1["service_date"]).dt.date
        left1["actual_dt"]    = pd.to_datetime(left1["actual_dt"])

        m1 = groupwise_asof(left1, right, tol)
        m1["matched_using"] = "service_date_1"

        keycols = ["trip_uid","route_id","stop_id","event_kind","actual_dt"]
        m0["k"] = m0[keycols].astype(str).agg("|".join, axis=1)
        m1["k"] = m1[keycols].astype(str).agg("|".join, axis=1)

        fill_mask = m0["scheduled_dt"].isna()
        if fill_mask.any():
            m1_valid = m1[m1["scheduled_dt"].notna()].set_index("k")
            m1_valid = m1_valid[~m1_valid.index.duplicated(keep="first")]
            fill_keys = m0.loc[fill_mask, "k"]
            can_fill  = fill_mask & m0["k"].isin(m1_valid.index)
            if can_fill.any():
                fk = m0.loc[can_fill, "k"]
                m0.loc[can_fill, "scheduled_dt"]  = m1_valid.loc[fk, "scheduled_dt"].values
                m0.loc[can_fill, "matched_using"] = "service_date_1"

        joined = m0.drop(columns=["k"])
    else:
        joined = m0

    joined["actual_dt"]    = pd.to_datetime(joined["actual_dt"],    errors="coerce")
    joined["scheduled_dt"] = pd.to_datetime(joined["scheduled_dt"], errors="coerce")
    joined["delay_seconds"] = (
        (joined["actual_dt"] - joined["scheduled_dt"]) / pd.Timedelta(seconds=1)
    )

    stops_small = stops[["stop_id","stop_name","parent_station","stop_lat","stop_lon"]].copy()
    joined = joined.merge(stops_small, on="stop_id", how="left")

    joined["direction"]  = joined["stop_id"].str[-1].map(
        {"N": "Uptown/North", "S": "Downtown/South"}
    )
    route_map = {
        "GS": "Grand Central Shuttle",
        "FS": "Franklin Av Shuttle",
        "H":  "Rockaway Park Shuttle",
    }
    joined["route_name"] = joined["route_id"].replace(route_map)

    joined["service_date_out"] = pd.to_datetime(joined["scheduled_dt"]).dt.date
    joined["scheduled_time"]   = pd.to_datetime(joined["scheduled_dt"]).dt.strftime("%H:%M:%S")
    joined["actual_time"]      = pd.to_datetime(joined["actual_dt"]).dt.strftime("%H:%M:%S")
    joined["hour"]             = pd.to_datetime(joined["scheduled_dt"]).dt.hour
    joined["day_of_week"]      = pd.to_datetime(joined["scheduled_dt"]).dt.day_name()

    parent_lookup = stops[
        stops["location_type"].fillna("").astype(str).eq("1")
    ][["stop_id","stop_name"]].copy().rename(
        columns={"stop_id": "parent_station", "stop_name": "parent_stop_name"}
    )
    joined = joined.merge(parent_lookup, on="parent_station", how="left")

    return joined[[
        "service_date_out","route_name","direction","stop_id","stop_name",
        "parent_stop_name","stop_sequence","event_kind","scheduled_dt",
        "actual_dt","delay_seconds","scheduled_time","actual_time",
        "hour","day_of_week","trip_uid",
    ]].rename(columns={"service_date_out": "service_date"})


# ── Aggregation ───────────────────────────────────────────────────────────────

def aggregate_to_final(clean_dir: Path, final_dir: Path) -> None:
    """
    Aggregate daily clean parquet files into monthly/weekday parquet files
    matching the format expected by the model trainer.
    """
    clean_files = sorted(glob.glob(str(clean_dir / "*.parquet")))
    if not clean_files:
        raise FileNotFoundError(f"No clean parquet files found in {clean_dir}")

    final_dir.mkdir(parents=True, exist_ok=True)
    stats: dict = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))

    print(f"Aggregating {len(clean_files)} daily files…")
    for idx, f in enumerate(clean_files, 1):
        if idx % 50 == 0:
            print(f"  {idx}/{len(clean_files)}")

        df = pd.read_parquet(f)
        df["service_date"] = pd.to_datetime(df["service_date"])
        df["month_period"] = df["service_date"].dt.to_period("M").astype(str)
        df["day_of_week"]  = df["service_date"].dt.day_name()

        df = df[df["event_kind"] == "arrival"]
        df = df[df["delay_seconds"].notna()]
        if df.empty:
            continue

        for (mp, dow, *key_vals), g in df.groupby(
            ["month_period", "day_of_week"] + KEY_COLS, observed=True
        ):
            bucket = stats[(mp, dow)][tuple(key_vals)]
            bucket[0] += g["delay_seconds"].sum()
            bucket[1] += len(g)

    print("Writing final parquet files…")
    for (mp, dow), key_map in stats.items():
        rows = []
        for key, (total, count) in key_map.items():
            if count < MIN_COUNT:
                continue
            row = {"month_period": mp, "day_of_week": dow}
            row.update({col: val for col, val in zip(KEY_COLS, key)})
            row["avg_delay_seconds"] = total / count
            row["count"] = count
            rows.append(row)

        if not rows:
            continue

        out_df   = pd.DataFrame(rows)
        out_path = final_dir / f"{mp}_{dow}.parquet"
        out_df.to_parquet(out_path, index=False)

    print(f"✓ Final parquet files written to {final_dir}")


def add_season(final_dir: Path) -> None:
    """Add season column to all final parquet files (mirrors add_season_and_holiday notebook)."""
    def get_season(month_period_str: str) -> str:
        month = int(str(month_period_str).split("-")[1])
        if month in [12, 1, 2]:  return "Winter"
        if month in [3, 4, 5]:   return "Spring"
        if month in [6, 7, 8]:   return "Summer"
        return "Fall"

    files = glob.glob(str(final_dir / "*.parquet"))
    for f in files:
        df = pd.read_parquet(f)
        if "season" not in df.columns:
            df["season"]  = df["month_period"].apply(get_season)
            df["holiday"] = "no"
            df.to_parquet(f, index=False)
    print(f"✓ Season column added to {len(files)} files")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n── OnTime Data Preparation Pipeline ──────────────────────────────")
    print(
        "\nNOTE: This script requires:\n"
        f"  - Raw daily parquet files in: {PARQUET_DIR}\n"
        f"  - GTFS schedule folders in:   {GTFS_ROOT}\n"
        "  These are not in the repo and must be obtained separately.\n"
        "  Contact the data science team for access.\n"
    )

    # Step 1: Check inputs exist
    if not PARQUET_DIR.exists() or not any(PARQUET_DIR.glob("*_part2.parquet")):
        print("ERROR: No raw parquet files found. Exiting.")
        return
    if not GTFS_ROOT.exists():
        print("ERROR: GTFS directory not found. Exiting.")
        return

    # Step 2: Build GTFS index
    print("[1/4] Building GTFS index…")
    gtfs_index = build_gtfs_index()
    print(f"  Found {len(gtfs_index)} GTFS versions")

    # Step 3: Process each daily file into clean parquet
    print("\n[2/4] Processing daily files…")
    CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    stop_level_files = sorted(PARQUET_DIR.glob("*_part2.parquet"))
    written = 0

    for idx, p in enumerate(stop_level_files, 1):
        m = re.search(r"(\d{4}-\d{2}-\d{2})", p.name)
        if not m:
            continue
        d = datetime.strptime(m.group(1), "%Y-%m-%d").date()

        out_path = CLEAN_DIR / f"{d}.parquet"
        if out_path.exists():
            continue

        gtfs_dir = pick_gtfs_for_day(d, gtfs_index)
        if gtfs_dir is None:
            print(f"  SKIP {d} (no GTFS coverage)")
            continue

        print(f"  [{idx}/{len(stop_level_files)}] {d}…", end=" ", flush=True)
        gtfs    = load_gtfs_tables(gtfs_dir)
        day_df  = process_one_day(str(p), gtfs, TOLERANCE_MIN)

        if day_df.empty:
            print("empty output")
            continue

        day_df.to_parquet(out_path, index=False)
        written += 1
        print(f"OK ({len(day_df):,} rows)")

    print(f"  Written: {written} new daily files")

    # Step 4: Aggregate to final_data/
    print("\n[3/4] Aggregating to monthly/weekday format…")
    aggregate_to_final(CLEAN_DIR, FINAL_DIR)

    # Step 5: Add season column
    print("\n[4/4] Adding season column…")
    add_season(FINAL_DIR)

    print("\n── Done. Run retrain.py to update the model. ─────────────────────\n")
    print("    python -m pipeline.retrain --skip-fetch")


if __name__ == "__main__":
    main()