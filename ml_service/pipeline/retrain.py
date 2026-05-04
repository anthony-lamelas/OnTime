"""
ml_service/pipeline/retrain.py

Retrains the OnTime delay prediction model on all available data in
ml_service/data/final_data/.

── Typical workflow ──────────────────────────────────────────────────
1. New raw data arrives (parquet_daily/ + updated GTFS folders)
2. Run prepare_data.py to process raw data into final_data/:
       python -m pipeline.prepare_data
3. Run this script to retrain the model:
       python -m pipeline.retrain --skip-fetch
4. Restart the ml_service to load the new model.
──────────────────────────────────────────────────────────────────────

If you only want to retrain on existing data (no new raw data):
    python -m pipeline.retrain --skip-fetch

If you have a new pre-processed CSV to add before retraining:
    python -m pipeline.retrain --new-file path/to/new_data.csv
"""

import argparse
import json
import os
import glob
import shutil
import numpy as np
import pandas as pd
import joblib
import lightgbm as lgb

from datetime import datetime
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# ── Paths ─────────────────────────────────────────────────────────────────────
ML_SERVICE_DIR = Path(__file__).parent.parent
DATA_DIR       = ML_SERVICE_DIR / "data" / "final_data"
MODELS_DIR     = ML_SERVICE_DIR / "models"

MODEL_PATH     = MODELS_DIR / "delay_model.joblib"
BACKUP_PATH    = MODELS_DIR / "delay_model_backup.joblib"
ENCODERS_PATH  = MODELS_DIR / "label_encoders.joblib"
META_PATH      = MODELS_DIR / "model_meta.json"

# ── Config ────────────────────────────────────────────────────────────────────
TARGET_COL   = "avg_delay_seconds"
TEST_SIZE    = 0.2
RANDOM_STATE = 42

COLUMNS = [
    "month_period", "day_of_week", "route_name", "direction",
    "stop_id", "stop_name", "stop_sequence", "hour",
    "avg_delay_seconds", "count"
]


# ── Step 1: Fetch new data ────────────────────────────────────────────────────

def fetch_new_data(output_path: Path) -> bool:
    """
    For this project, new data is fetched and processed via prepare_data.py,
    which handles the full pipeline:
      - Raw daily parquet files (parquet_daily/*_part2.parquet)
      - GTFS schedule folders (gtfs/)
      - Matching actual vs scheduled times
      - Aggregating into final_data/ parquet files

    To add new data, run:
        python -m pipeline.prepare_data

    Then retrain with:
        python -m pipeline.retrain --skip-fetch

    If we find the original data.ny.gov source URL, we can
    implement a direct fetch here instead.
    """

    """
    Fetch new MTA delay data from data.ny.gov and save to final_data/.
    Returns True if successful, False otherwise.
    """

    """
    import httpx
    import io

    # The Socrata API URL for the dataset — replace XXXX-XXXX with the real dataset ID
    # Find this on the data.ny.gov dataset page under "API" → "API Endpoint"
    BASE_URL = "https://data.ny.gov/resource/XXXX-XXXX.json"

    # Fetch only data newer than what we already have
    existing_files = sorted(glob.glob(str(DATA_DIR / "*.parquet")))
    if existing_files:
        # Get the most recent month_period we have e.g. "2026-01"
        latest = pd.read_parquet(existing_files[-1])["month_period"].max()
        where_clause = f"month_period > '{latest}'"
    else:
        where_clause = None

    params = {
        "$limit": 500000,
        "$order": "month_period ASC",
    }
    if where_clause:
        params["$where"] = where_clause

    try:
        print(f"  Fetching from {BASE_URL}…")
        response = httpx.get(BASE_URL, params=params, timeout=120)
        response.raise_for_status()

        df = pd.read_json(io.StringIO(response.text))
        if df.empty:
            print("  No new data available.")
            return False

        # Rename columns to match our schema if needed
        df = df.rename(columns={
            "route_id": "route_name",
            "avg_delay_sec": "avg_delay_seconds",
            # add any other column name mappings here
        })

        # Save one parquet per month/day combination
        for (period, dow), group in df.groupby(["month_period", "day_of_week"]):
            out_path = DATA_DIR / f"{period}_{dow}.parquet"
            group.to_parquet(out_path, index=False)
            print(f"  ✓ Saved {out_path.name} ({len(group):,} rows)")

        return True

    except Exception as e:
        print(f"  ✗ Fetch failed: {e}")
        return False
    """
    print("⚠️  fetch_new_data() not implemented.")
    print("   Run prepare_data.py instead to process new raw data.")
    print("   See ml_service/pipeline/prepare_data.py for details.")
    return False


# ── Step 2: Process new CSV into parquet ──────────────────────────────────────

def process_csv(csv_path: Path) -> Path:
    """Convert a raw CSV file to parquet and save to DATA_DIR."""
    df = pd.read_csv(csv_path, header=None, names=COLUMNS)

    # Derive filename from month_period and day_of_week in data
    period   = df["month_period"].iloc[0].replace("/", "-")   # e.g. 2026-02
    day      = df["day_of_week"].iloc[0]                      # e.g. Monday
    out_path = DATA_DIR / f"{period}_{day}.parquet"

    df.to_parquet(out_path, index=False)
    print(f"✓ Saved {out_path.name}  ({len(df):,} rows)")
    return out_path


# ── Step 3: Load all parquet files ────────────────────────────────────────────

def load_all_data() -> pd.DataFrame:
    files = sorted(glob.glob(str(DATA_DIR / "*.parquet")))
    if not files:
        raise FileNotFoundError(f"No parquet files found in {DATA_DIR}")

    dfs = []
    for f in files:
        df = pd.read_parquet(f)
        # Ensure month_period column exists (some files may use different naming)
        if "month_period" not in df.columns and len(df.columns) == len(COLUMNS):
            df.columns = COLUMNS
        dfs.append(df)

    combined = pd.concat(dfs, ignore_index=True)
    print(f"✓ Loaded {len(files)} parquet files — {len(combined):,} total rows")
    return combined


# ── Step 4: Feature engineering ───────────────────────────────────────────────

def engineer_features(df: pd.DataFrame, encoders: dict = None) -> tuple:
    """
    Mirror of the notebook's engineer_features().
    If encoders=None, fit new LabelEncoders (training).
    Otherwise apply existing encoders without refitting (inference/test).
    """
    df = df.copy()

    # Parse year and month from month_period (e.g. "2024-12")
    if "month_period" in df.columns:
        df["year"]  = df["month_period"].str[:4].astype(int)
        df["month"] = df["month_period"].str[5:7].astype(int)

    # Cyclical encoding
    df["hour_sin"]  = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"]  = np.cos(2 * np.pi * df["hour"] / 24)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)

    # Rush hour / late night flags
    df["is_rush_hour"]  = df["hour"].apply(lambda h: int(h in [7, 8, 9, 16, 17, 18]))
    df["is_late_night"] = df["hour"].apply(lambda h: int(h in [0, 1, 2, 3, 4]))

    # Label encode categoricals
    cat_cols = ["route_name", "direction", "stop_id", "day_of_week", "season"]

    # Derive season from month if not present
    if "season" not in df.columns:
        def _season(m):
            if m in [12, 1, 2]: return "Winter"
            if m in [3, 4, 5]:  return "Spring"
            if m in [6, 7, 8]:  return "Summer"
            return "Fall"
        df["season"] = df["month"].apply(_season)

    fit_new = encoders is None
    if fit_new:
        encoders = {}

    for col in cat_cols:
        if col not in df.columns:
            continue
        if fit_new:
            le = LabelEncoder()
            df[f"{col}_enc"] = le.fit_transform(df[col].astype(str))
            encoders[col] = le
        else:
            le = encoders[col]
            df[f"{col}_enc"] = df[col].astype(str).apply(
                lambda v: int(le.transform([v])[0]) if v in set(le.classes_) else 0
            )

    # Drop raw columns no longer needed
    drop_cols = ["month_period", "stop_name"] + cat_cols
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    return df, encoders


# ── Step 5: Train model ───────────────────────────────────────────────────────

def train_model(X_train, y_train, X_val, y_val):
    model = lgb.LGBMRegressor(
        n_estimators=8000,
        learning_rate=0.05,
        num_leaves=127,
        min_child_samples=20,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=RANDOM_STATE,
        n_jobs=-1,
        verbose=-1,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[lgb.early_stopping(stopping_rounds=100, verbose=False)],
    )
    return model


# ── Step 6: Evaluate ─────────────────────────────────────────────────────────

def evaluate(model, X_test, y_test) -> dict:
    preds = model.predict(X_test)
    mae   = mean_absolute_error(y_test, preds)
    rmse  = np.sqrt(mean_squared_error(y_test, preds))
    r2    = r2_score(y_test, preds)
    print(f"  MAE : {mae:.1f}s")
    print(f"  RMSE: {rmse:.1f}s")
    print(f"  R²  : {r2:.4f}")
    return {"MAE_seconds": mae, "RMSE_seconds": rmse, "R2": r2}


# ── Step 7: Backup and deploy ─────────────────────────────────────────────────

def backup_and_deploy(model, encoders: dict, features: list, metrics: dict):
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Backup existing model
    if MODEL_PATH.exists():
        shutil.copy(MODEL_PATH, BACKUP_PATH)
        print(f"✓ Backed up existing model → {BACKUP_PATH.name}")

    # Save new model
    joblib.dump(model, MODEL_PATH)
    print(f"✓ Saved new model → {MODEL_PATH.name}")

    # Save encoders
    joblib.dump(encoders, ENCODERS_PATH)
    print(f"✓ Saved encoders → {ENCODERS_PATH.name}")

    # Save metadata
    meta = {
        "model_name": "LightGBM",
        "features": features,
        "target": TARGET_COL,
        "trained_at": datetime.now().isoformat(),
        "metrics": metrics,
    }
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"✓ Saved metadata → {META_PATH.name}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Retrain the OnTime delay model")
    parser.add_argument("--new-file", type=str, default=None,
                        help="Path to a new CSV file to add before retraining")
    parser.add_argument("--skip-fetch", action="store_true",
                        help="Skip the data fetch step")
    args = parser.parse_args()

    print("\n── OnTime Model Retraining Pipeline ──────────────────────────────")

    # Step 1: Fetch new data
    if not args.skip_fetch and not args.new_file:
        print("\n[1/5] Fetching new data…")
        fetched_path = DATA_DIR / f"new_data_{datetime.now().strftime('%Y%m%d')}.csv"
        fetch_new_data(fetched_path)
    elif args.new_file:
        print(f"\n[1/5] Processing provided file: {args.new_file}")
        process_csv(Path(args.new_file))
    else:
        print("\n[1/5] Skipping fetch — retraining on existing data")

    # Step 2: Load all data
    print("\n[2/5] Loading all parquet files…")
    df_raw = load_all_data()
    df_raw = df_raw.dropna(subset=[TARGET_COL])

    # Step 3: Feature engineering + split
    print("\n[3/5] Engineering features and splitting data…")
    train_raw, test_raw = train_test_split(df_raw, test_size=TEST_SIZE,
                                           random_state=RANDOM_STATE)
    df_train, encoders = engineer_features(train_raw)
    df_test, _         = engineer_features(test_raw, encoders=encoders)

    X_train = df_train.drop(columns=[TARGET_COL])
    y_train = df_train[TARGET_COL]
    X_test  = df_test.drop(columns=[TARGET_COL])
    y_test  = df_test[TARGET_COL]

    # Holdout from train for early stopping
    X_fit, X_val, y_fit, y_val = train_test_split(X_train, y_train,
                                                    test_size=0.1,
                                                    random_state=RANDOM_STATE)

    print(f"  Train: {len(X_fit):,} rows | Val: {len(X_val):,} | Test: {len(X_test):,}")
    print(f"  Features ({X_train.shape[1]}): {X_train.columns.tolist()}")

    # Step 4: Train
    print("\n[4/5] Training LightGBM model…")
    model = train_model(X_fit, y_fit, X_val, y_val)

    # Step 5: Evaluate + deploy
    print("\n[5/5] Evaluating and deploying…")
    metrics = evaluate(model, X_test, y_test)
    backup_and_deploy(model, encoders, X_train.columns.tolist(), metrics)

    print("\n── Done. Restart ml_service to load the new model. ──────────────\n")


if __name__ == "__main__":
    main()