#!/usr/bin/env python3
"""Generate the legacy full Dali Ganji ICS file."""

from __future__ import annotations

import argparse
from pathlib import Path

from calendar_data import (
    DEFAULT_DATA_PATH,
    DEFAULT_ICS_PATH,
    MONTHS_AHEAD,
    add_months,
    build_event_records,
    build_ics_from_events,
    load_markets,
    parse_iso_date,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate public/dali-ganji.ics")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_ICS_PATH)
    parser.add_argument("--start-date", help="Override generation start date, YYYY-MM-DD.")
    args = parser.parse_args()

    start = parse_iso_date(args.start_date)
    end = add_months(start, MONTHS_AHEAD)
    markets = load_markets(args.data)
    events = build_event_records(markets, start, end)
    ics = build_ics_from_events(events)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as file:
        file.write(ics)
    print(f"Generated {args.output} with {len(events)} events from {start.isoformat()} to {end.isoformat()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
