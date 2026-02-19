import calendar
import io
import os
import tarfile
from pathlib import Path

import pandas as pd
import requests


BASE_URL = "https://subwaydata.nyc/data"
YEAR = 2025

DOWNLOAD_DIR = Path("downloads_tar_xz")
EXTRACT_DIR = Path("extracted_csv")
PARQUET_DIR = Path("parquet_daily")

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
PARQUET_DIR.mkdir(parents=True, exist_ok=True)


def download_file(url: str, out_path: Path, timeout: int = 60) -> bool:
    """Stream-download to disk. Returns True if downloaded successfully."""
    try:
        with requests.get(url, stream=True, timeout=timeout) as r:
            if r.status_code == 404:
                print(f"404 (not found): {url}")
                return False
            r.raise_for_status()
            with open(out_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
        return True
    except requests.RequestException as e:
        print(f"Download failed: {url} ({e})")
        return False


def extract_tar_xz(tar_path: Path, out_dir: Path) -> list[Path]:
    """
    Extract tar.xz to out_dir. Returns list of extracted CSV paths.
    """
    csv_paths: list[Path] = []
    with tarfile.open(tar_path, mode="r:*") as tf:
        members = [m for m in tf.getmembers() if m.isfile()]
        tf.extractall(path=out_dir, members=members)
        for m in members:
            p = out_dir / m.name
            if p.suffix.lower() == ".csv":
                csv_paths.append(p)
    return csv_paths


def csv_to_parquet(csv_path: Path, parquet_path: Path) -> None:
    """
    Convert CSV -> Parquet (snappy). Keeps all columns.
    If you want smaller files, drop columns before writing.
    """
    df = pd.read_csv(csv_path)
    df.to_parquet(parquet_path, index=False, engine="pyarrow", compression="snappy")


def main():
    for month in range(1, 13):
        days_in_month = calendar.monthrange(YEAR, month)[1]
        for day in range(1, days_in_month + 1):
            date_str = f"{YEAR}-{month:02d}-{day:02d}"

            # Your original naming pattern, but with proper zero-padding for month/day.
            tar_name = f"subwaydatanyc_{date_str}_csv.tar.xz"
            url = f"{BASE_URL}/{tar_name}"

            tar_path = DOWNLOAD_DIR / tar_name
            parquet_path = PARQUET_DIR / f"{date_str}.parquet"

            # Skip if already converted
            if parquet_path.exists():
                print(f"Skip (already have parquet): {parquet_path.name}")
                continue

            # Download
            print(f"Downloading: {tar_name}")
            ok = download_file(url, tar_path)
            if not ok:
                continue

            # Extract
            day_extract_dir = EXTRACT_DIR / date_str
            day_extract_dir.mkdir(parents=True, exist_ok=True)
            csv_files = extract_tar_xz(tar_path, day_extract_dir)

            if not csv_files:
                print(f"No CSV found inside: {tar_name}")
                continue

            # If there are multiple CSVs, convert each (or pick the first).
            # Most days should have exactly one.
            if len(csv_files) == 1:
                csv_path = csv_files[0]
                print(f"Converting to parquet: {csv_path.name} -> {parquet_path.name}")
                csv_to_parquet(csv_path, parquet_path)
            else:
                # Convert each CSV to its own parquet (suffix them)
                for k, csv_path in enumerate(csv_files, start=1):
                    out_pq = PARQUET_DIR / f"{date_str}_part{k}.parquet"
                    print(f"Converting to parquet: {csv_path.name} -> {out_pq.name}")
                    csv_to_parquet(csv_path, out_pq)

            # Optional cleanup:
            # - delete the tar.xz after successful conversion
            # - delete extracted CSVs to save space
            #
            # tar_path.unlink(missing_ok=True)
            # for p in csv_files:
            #     p.unlink(missing_ok=True)

    print("Done.")


if __name__ == "__main__":
    main()
