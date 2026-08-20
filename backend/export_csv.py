"""
CSV export for a schema's records. Plain UTF-8 with BOM so Excel opens
non-Latin text (Sinhala etc.) correctly instead of mangling it -
Excel's CSV importer assumes the system codepage unless it sees a BOM.
"""

import csv


def export_records_to_csv(fields, records, out_path):
    fieldnames = [f["name"] for f in fields]
    labels = {f["name"]: f.get("label", f["name"]) for f in fields}

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writerow(labels)  # header row uses human-readable labels
        for record in records:
            row = {name: record["data"].get(name, "") for name in fieldnames}
            writer.writerow(row)

    return out_path
