#!/usr/bin/env python3
"""Generate public events data for the dynamic calendar API."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from calendar_data import (
    DEFAULT_DATA_PATH,
    DEFAULT_EVENTS_PATH,
    DEFAULT_PUBLIC_MARKETS_PATH,
    MONTHS_AHEAD,
    add_months,
    build_event_records,
    load_markets,
    parse_iso_date,
    public_market_records,
)


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate public/events.json and public/markets.json")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_EVENTS_PATH)
    parser.add_argument("--markets-output", type=Path, default=DEFAULT_PUBLIC_MARKETS_PATH)
    parser.add_argument("--start-date", help="Override generation start date, YYYY-MM-DD.")
    args = parser.parse_args()

    start = parse_iso_date(args.start_date)
    end = add_months(start, MONTHS_AHEAD)
    markets = load_markets(args.data)
    events = build_event_records(markets, start, end)

    write_json(args.output, events)
    write_json(args.markets_output, public_market_records(markets))

    print(
        f"Generated {args.output} with {len(events)} events from "
        f"{start.isoformat()} to {end.isoformat()}."
    )
    print(f"Generated {args.markets_output} with {len(markets)} markets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
