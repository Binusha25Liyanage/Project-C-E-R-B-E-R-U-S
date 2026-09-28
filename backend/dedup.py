"""
Fuzzy duplicate detection.

Approach: for a given record, build a single comparison string from its
text-like field values (text and dropdown fields - numbers/dates/booleans
are too coarse-grained to usefully fuzzy-match on), then compare that
string against every other record in the same schema using RapidFuzz's
token_sort_ratio, which is robust to word order and minor typos ("Lakmee
Exports" vs "Exports Lakmee" still scores high).

This is deliberately a *flag*, not an auto-merge: matches above the
threshold are recorded for a human to review, never silently merged or
rejected. Comparisons are O(n) per record against the rest of the schema,
which is fine at the record counts a single-user local tool deals with;
it isn't built to scale to hundreds of thousands of rows.
"""

from rapidfuzz import fuzz

DEFAULT_THRESHOLD = 85  # 0-100, RapidFuzz's own scale


def _comparison_string(fields, data):
    """Concatenates text/dropdown field values into one string to compare."""
    parts = []
    for f in fields:
        if f["type"] in ("text", "dropdown"):
            value = data.get(f["name"])
            if value:
                parts.append(str(value))
    return " ".join(parts).strip()


def find_duplicates_for_record(fields, target_record_id, target_data, other_records, threshold=DEFAULT_THRESHOLD):
    """
    Compares one record against a list of other records (each a dict with
    'id' and 'data' keys, as returned by Database.list_records).
    Returns a list of {matched_record_id, similarity_score} for matches
    scoring >= threshold, excluding the record compared against itself.
    """
    target_str = _comparison_string(fields, target_data)
    if not target_str:
        return []  # nothing text-like to compare on

    matches = []
    for other in other_records:
        if other["id"] == target_record_id:
            continue
        other_str = _comparison_string(fields, other["data"])
        if not other_str:
            continue
        score = fuzz.token_sort_ratio(target_str, other_str)
        if score >= threshold:
            matches.append({"matched_record_id": other["id"], "similarity_score": round(score, 1)})

    return matches


def scan_schema_for_duplicates(fields, records, threshold=DEFAULT_THRESHOLD):
    """
    Pairwise scan across every record in a schema. Returns a list of
    {record_id, matched_record_id, similarity_score}, each pair reported
    only once (record_id < matched_record_id by insertion order avoided
    via a seen-pairs set).
    """
    results = []
    seen_pairs = set()

    for i, record in enumerate(records):
        record_str = _comparison_string(fields, record["data"])
        if not record_str:
            continue
        for other in records[i + 1:]:
            other_str = _comparison_string(fields, other["data"])
            if not other_str:
                continue
            score = fuzz.token_sort_ratio(record_str, other_str)
            if score >= threshold:
                pair_key = tuple(sorted((record["id"], other["id"])))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                results.append({
                    "record_id": record["id"],
                    "matched_record_id": other["id"],
                    "similarity_score": round(score, 1),
                })

    return results
