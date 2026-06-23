#!/usr/bin/env python3
"""Generate static ICS files for every selectable market combination."""

from __future__ import annotations

import argparse
import itertools
from pathlib import Path

from calendar_data import (
    CALENDAR_NAME,
    DEFAULT_DATA_PATH,
    MONTHS_AHEAD,
    ROOT,
    add_months,
    build_event_records,
    build_ics_from_events,
    calendar_label,
    clean,
    load_markets,
    parse_iso_date,
)


DEFAULT_OUTPUT_DIR = ROOT / "public" / "calendars"


def combo_filename(market_ids: list[str]) -> str:
    return "__".join(market_ids) + ".ics"


def calendar_title(markets: list[dict]) -> str:
    if len(markets) == 1:
        return f"{CALENDAR_NAME}｜{calendar_label(clean(markets[0].get('name')))}"
    if len(markets) <= 3:
        labels = [calendar_label(clean(market.get("name"))) for market in markets]
        return f"{CALENDAR_NAME}｜{'、'.join(labels)}"
    return f"{CALENDAR_NAME}｜已选 {len(markets)} 个集市"


def write_combo_calendar(
    output_dir: Path,
    markets: list[dict],
    events_by_market: dict[str, list[dict]],
) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    for old_file in output_dir.glob("*.ics"):
        old_file.unlink()

    count = 0
    for size in range(1, len(markets) + 1):
        for combo in itertools.combinations(markets, size):
            market_ids = [clean(market.get("id")) for market in combo]
            events = [
                event
                for market_id in market_ids
                for event in events_by_market.get(market_id, [])
            ]
            events.sort(key=lambda event: (event["date"], event["market_index"], event["market_id"]))
            ics = build_ics_from_events(events, calendar_title(list(combo)))
            output_path = output_dir / combo_filename(market_ids)
            with output_path.open("w", encoding="utf-8", newline="") as file:
                file.write(ics)
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate static ICS files for all market combinations.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--start-date", help="Override generation start date, YYYY-MM-DD.")
    args = parser.parse_args()

    start = parse_iso_date(args.start_date)
    end = add_months(start, MONTHS_AHEAD)
    markets = [market for market in load_markets(args.data) if clean(market.get("id"))]
    events = build_event_records(markets, start, end)
    events_by_market: dict[str, list[dict]] = {}
    for event in events:
        events_by_market.setdefault(event["market_id"], []).append(event)

    count = write_combo_calendar(args.output_dir, markets, events_by_market)
    print(f"Generated {count} static calendars in {args.output_dir}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
