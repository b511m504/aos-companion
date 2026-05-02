import json
import re
from collections import defaultdict
from pathlib import Path


INPUT_PATH = Path("extracted/raw_units.json")
OUTPUT_DIR = Path("data")


def normalize_filename(value: str) -> str:
    normalized = value.strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized or "unknown-faction"


def main() -> None:
    try:
        raw_text = INPUT_PATH.read_text(encoding="utf-8")
        data = json.loads(raw_text)
    except FileNotFoundError:
        print(f"Input file not found: {INPUT_PATH}")
        return
    except json.JSONDecodeError as error:
        print(f"Invalid JSON in {INPUT_PATH}: {error}")
        return

    print(f"Raw data type: {type(data).__name__}")

    raw_units = []
    if isinstance(data, list):
        raw_units = data
    elif isinstance(data, dict):
        for faction_key, faction_units in data.items():
            if not isinstance(faction_units, list):
                print(f"Warning: skipping faction '{faction_key}' because value is not a list")
                continue
            for unit in faction_units:
                if not isinstance(unit, dict):
                    raw_units.append(unit)
                    continue
                if "faction" not in unit or not str(unit.get("faction", "")).strip():
                    unit = dict(unit)
                    unit["faction"] = str(faction_key)
                raw_units.append(unit)
    else:
        print("Unexpected structure: expected list or dictionary.")
        print(f"Sample: {repr(data)[:500]}")
        return

    if not raw_units:
        print("ERROR: No units found — upstream extractor likely failed")
        print(raw_text[:500])
        return

    units = []
    for index, item in enumerate(raw_units):
        if not isinstance(item, dict):
            print(f"Warning: skipping unit at index {index} because it is not a dictionary")
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            print(f"Warning: skipping unit at index {index} because 'name' is missing/invalid")
            continue
        units.append(item)

    if not units:
        print("ERROR: No units found — upstream extractor likely failed")
        print(raw_text[:500])
        return

    print(f"Units loaded: {len(units)}")

    grouped = defaultdict(list)
    for unit in units:
        faction = unit.get("faction")
        if isinstance(faction, str) and faction.strip():
            faction_key = faction.strip()
        else:
            faction_key = "Unknown"
        grouped[faction_key].append(unit)

    print(f"Factions found: {len(grouped)}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for faction, faction_units in sorted(grouped.items(), key=lambda item: item[0].lower()):
        filename = f"{normalize_filename(faction)}.json"
        output_path = OUTPUT_DIR / filename
        output_path.write_text(
            json.dumps(faction_units, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"{faction}: {len(faction_units)} units")

    print("Sample processed units:")
    print(json.dumps(units[:2], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
