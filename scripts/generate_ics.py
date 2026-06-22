#!/usr/bin/env python3
"""Generate the Dali Ganji Apple Calendar subscription ICS file."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

try:
    from lunardate import LunarDate
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: lunardate. Run `python3 -m pip install -r requirements.txt` first."
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_PATH = ROOT / "data" / "markets.json"
DEFAULT_OUTPUT_PATH = ROOT / "public" / "dali-ganji.ics"

CALENDAR_NAME = "大理赶集日历"
TIMEZONE = "Asia/Shanghai"
DOMAIN = "dali-ganji-calendar"
MONTHS_AHEAD = 18


def add_months(day: date, months: int) -> date:
    year = day.year + (day.month - 1 + months) // 12
    month = (day.month - 1 + months) % 12 + 1
    month_lengths = [31, 29 if is_leap_year(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return date(year, month, min(day.day, month_lengths[month - 1]))


def is_leap_year(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def load_markets(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError("markets.json must contain a list of market objects.")
    return [market for market in data if isinstance(market, dict)]


def parse_iso_date(value: str | None) -> date:
    if not value:
        return datetime.now(ZoneInfo(TIMEZONE)).date()
    return date.fromisoformat(value)


def market_dates(market: dict[str, Any], start: date, end: date) -> list[date]:
    schedule_type = market.get("schedule_type")
    if schedule_type == "lunar_days":
        return lunar_market_dates(market, start, end)
    if schedule_type == "weekly":
        return weekly_market_dates(market, start, end)
    if schedule_type == "gregorian_month_days":
        return gregorian_month_dates(market, start, end)
    raise ValueError(f"{market.get('id', '<unknown>')}: unsupported schedule_type {schedule_type!r}")


def lunar_market_dates(market: dict[str, Any], start: date, end: date) -> list[date]:
    lunar_days = market.get("lunar_days") or []
    if not isinstance(lunar_days, list):
        raise ValueError(f"{market.get('id', '<unknown>')}: lunar_days must be a list.")

    dates: set[date] = set()
    for lunar_year in range(start.year - 1, end.year + 2):
        for lunar_month in range(1, 13):
            for lunar_day in lunar_days:
                for is_leap_month in (False, True):
                    try:
                        solar_day = LunarDate(
                            lunar_year, lunar_month, int(lunar_day), is_leap_month
                        ).toSolarDate()
                    except (ValueError, TypeError):
                        continue
                    if start <= solar_day < end:
                        dates.add(solar_day)
    return sorted(dates)


def weekly_market_dates(market: dict[str, Any], start: date, end: date) -> list[date]:
    weekdays = market.get("weekdays", [])
    if not isinstance(weekdays, list) or not weekdays:
        raise ValueError(f"{market.get('id', '<unknown>')}: weekly markets need weekdays, Monday=0.")

    wanted = {int(day) for day in weekdays}
    current = start
    dates: list[date] = []
    while current < end:
        if current.weekday() in wanted:
            dates.append(current)
        current += timedelta(days=1)
    return dates


def gregorian_month_dates(market: dict[str, Any], start: date, end: date) -> list[date]:
    month_days = market.get("month_days", [])
    if not isinstance(month_days, list) or not month_days:
        raise ValueError(f"{market.get('id', '<unknown>')}: gregorian_month_days needs month_days.")

    wanted = {int(day) for day in month_days}
    current = start
    dates: list[date] = []
    while current < end:
        if current.day in wanted:
            dates.append(current)
        current += timedelta(days=1)
    return dates


def description_for(market: dict[str, Any]) -> str:
    intro = clean(market.get("intro"))
    schedule_text = clean(market.get("schedule_text")) or "时间待补充"
    place = clean(market.get("address")) or clean(market.get("location_name")) or "地点待补充"
    source_note = clean(market.get("source_note")) or "数据来自公开资料 + 实地验证中，如有误差欢迎反馈。"
    nav_links = navigation_links(market)

    lines = []
    if intro:
        lines.append(intro)
    lines.append(f"时间：{schedule_text}")
    lines.append(f"地点：{place}")
    if nav_links:
        lines.append(f"导航：{' / '.join(nav_links)}")
    lines.append(f"说明：{source_note}")
    return "\n".join(lines)


def navigation_links(market: dict[str, Any]) -> list[str]:
    links: list[str] = []
    apple_maps_url = clean(market.get("apple_maps_url"))
    amap_url = clean(market.get("amap_url"))

    if apple_maps_url:
        links.append(f"Apple 地图 {apple_maps_url}")
    elif has_coordinates(market):
        links.append(f"Apple 地图 {apple_maps_link(market)}")

    if amap_url:
        links.append(f"高德地图 {amap_url}")
    return links


def apple_maps_link(market: dict[str, Any]) -> str:
    lat = market.get("lat")
    lng = market.get("lng")
    name = clean(market.get("name")) or clean(market.get("location_name")) or "大理赶集"
    return f"https://maps.apple.com/?ll={lat},{lng}&q={quote(name)}"


def has_coordinates(market: dict[str, Any]) -> bool:
    return market.get("lat") is not None and market.get("lng") is not None


def clean(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def ical_escape(value: Any) -> str:
    text = clean(value)
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "\\n")
    )


def fold_ical_line(line: str) -> str:
    chunks: list[str] = []
    current = ""
    limit = 75
    for char in line:
        if len((current + char).encode("utf-8")) > limit:
            chunks.append(current)
            current = " " + char
            limit = 75
        else:
            current += char
    chunks.append(current)
    return "\r\n".join(chunks)


def add_property(lines: list[str], name: str, value: Any) -> None:
    lines.append(fold_ical_line(f"{name}:{ical_escape(value)}"))


def build_ics(markets: list[dict[str, Any]], start: date, end: date) -> str:
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Dali Ganji Calendar//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{CALENDAR_NAME}",
        f"X-WR-TIMEZONE:{TIMEZONE}",
    ]

    for market in markets:
        market_id = clean(market.get("id"))
        name = clean(market.get("name"))
        if not market_id or not name:
            print("Skipping market without id or name.", file=sys.stderr)
            continue

        for event_date in market_dates(market, start, end):
            lines.append("BEGIN:VEVENT")
            add_property(lines, "UID", f"{market_id}-{event_date.isoformat()}@{DOMAIN}")
            lines.append(f"DTSTAMP:{dtstamp}")
            lines.append(f"DTSTART;VALUE=DATE:{event_date.strftime('%Y%m%d')}")
            lines.append(f"DTEND;VALUE=DATE:{(event_date + timedelta(days=1)).strftime('%Y%m%d')}")
            add_property(lines, "SUMMARY", name)
            add_property(lines, "LOCATION", clean(market.get("location_name")) or clean(market.get("address")))
            add_property(lines, "DESCRIPTION", description_for(market))
            if has_coordinates(market):
                lines.append(f"GEO:{market.get('lat')};{market.get('lng')}")
            lines.append("TRANSP:TRANSPARENT")
            lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate public/dali-ganji.ics")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--start-date", help="Override generation start date, YYYY-MM-DD.")
    args = parser.parse_args()

    start = parse_iso_date(args.start_date)
    end = add_months(start, MONTHS_AHEAD)
    markets = load_markets(args.data)
    ics = build_ics(markets, start, end)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as file:
        file.write(ics)
    print(f"Generated {args.output} with events from {start.isoformat()} to {end.isoformat()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
