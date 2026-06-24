"""Shared data helpers for Dali Ganji calendar generation."""

from __future__ import annotations

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
DEFAULT_EVENTS_PATH = ROOT / "public" / "events.json"
DEFAULT_PUBLIC_MARKETS_PATH = ROOT / "public" / "markets.json"
DEFAULT_ICS_PATH = ROOT / "public" / "dali-ganji.ics"

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
    weekdays = market.get("weekday", market.get("weekdays", []))
    if isinstance(weekdays, int):
        weekdays = [weekdays]
    if not isinstance(weekdays, list) or not weekdays:
        raise ValueError(f"{market.get('id', '<unknown>')}: weekly markets need weekday, Monday=0.")

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


def build_event_records(markets: list[dict[str, Any]], start: date, end: date) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for market_index, market in enumerate(markets):
        market_id = clean(market.get("id"))
        name = clean(market.get("name"))
        if not market_id or not name:
            print("Skipping market without id or name.", file=sys.stderr)
            continue
        if not is_calendar_market(market):
            continue

        location = clean(market.get("location_name")) or clean(market.get("address"))
        for event_date in market_dates(market, start, end):
            events.append(
                {
                    "market_id": market_id,
                    "market_name": name,
                    "market_label": calendar_label(name),
                    "market_index": market_index,
                    "date": event_date.isoformat(),
                    "summary": name,
                    "location": location,
                    "description": description_for(market),
                    "lat": market.get("lat"),
                    "lng": market.get("lng"),
                    "apple_maps_url": clean(market.get("apple_maps_url")),
                    "amap_url": clean(market.get("amap_url")),
                }
            )

    return sorted(events, key=lambda event: (event["date"], event["market_index"], event["market_id"]))


def public_market_records(markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, market in enumerate(markets):
        name = clean(market.get("name"))
        images = market.get("images") if isinstance(market.get("images"), list) else []
        legacy_image = clean(market.get("image"))
        primary_image = clean(images[0].get("src")) if images and isinstance(images[0], dict) else legacy_image
        primary_alt = clean(images[0].get("alt")) if images and isinstance(images[0], dict) else clean(market.get("image_alt"))
        records.append(
            {
                "id": clean(market.get("id")),
                "name": name,
                "label": calendar_label(name),
                "location_name": clean(market.get("location_name")),
                "address": clean(market.get("address")),
                "area": clean(market.get("area")) or "其他",
                "market_type": clean(market.get("market_type")) or "periodic_fair",
                "calendar_enabled": is_calendar_market(market),
                "summary": clean(market.get("summary")) or clean(market.get("intro")),
                "intro": clean(market.get("intro")) or clean(market.get("summary")),
                "tags": clean_list(market.get("tags")),
                "best_for": clean_list(market.get("best_for")),
                "not_for": clean_list(market.get("not_for")),
                "lat": market.get("lat"),
                "lng": market.get("lng"),
                "image": primary_image,
                "image_alt": primary_alt,
                "image_credit": clean(market.get("image_credit")),
                "images": images,
                "schedule_type": clean(market.get("schedule_type")),
                "schedule_text": clean(market.get("schedule_text")),
                "open_text": clean(market.get("open_text")),
                "best_time": clean(market.get("best_time")),
                "duration": clean(market.get("duration")),
                "transport_tips": clean(market.get("transport_tips")),
                "parking_tips": clean(market.get("parking_tips")),
                "route_tips": clean(market.get("route_tips")),
                "what_to_buy": clean_list(market.get("what_to_buy")),
                "food_tips": clean_list(market.get("food_tips")),
                "photo_tips": clean(market.get("photo_tips")),
                "avoid_pitfalls": clean_list(market.get("avoid_pitfalls")),
                "nearby_places": clean_list(market.get("nearby_places")),
                "apple_maps_url": clean(market.get("apple_maps_url")),
                "amap_url": clean(market.get("amap_url")),
                "order": index,
            }
        )
    return [record for record in records if record["id"] and record["name"]]


def is_calendar_market(market: dict[str, Any]) -> bool:
    return (
        clean(market.get("market_type")) == "periodic_fair"
        and bool(market.get("calendar_enabled"))
    )


def clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [clean(item) for item in value if clean(item)]


def calendar_label(name: str) -> str:
    label = clean(name)
    for suffix in ("赶集", "集市"):
        if label.endswith(suffix):
            return label[: -len(suffix)]
    return label


def description_for(market: dict[str, Any]) -> str:
    intro = clean(market.get("summary")) or clean(market.get("intro"))
    schedule_text = clean(market.get("schedule_text")) or "时间待补充"
    place = clean(market.get("address")) or clean(market.get("location_name")) or "地点待补充"
    nav_links = navigation_links(market)
    reminders = clean_list(market.get("avoid_pitfalls"))

    lines = []
    if intro:
        lines.append(intro)
    lines.append(f"时间：{schedule_text}")
    lines.append(f"地点：{place}")
    if nav_links:
        lines.append(f"导航：{' / '.join(nav_links)}")
    if reminders:
        lines.append(f"提醒：{'、'.join(reminders[:3])}")
    return "\n".join(lines)


def navigation_links(market: dict[str, Any]) -> list[str]:
    links: list[str] = []
    amap_url = clean(market.get("amap_url"))

    if amap_url:
        links.append(f"高德地图 {amap_url}")
    else:
        links.append(f"高德地图 {amap_link(market)}")

    links.append(f"百度地图 {baidu_map_link(market)}")
    return links


def amap_link(market: dict[str, Any]) -> str:
    name = clean(market.get("name")) or clean(market.get("location_name")) or "大理赶集"
    if has_coordinates(market):
        return f"https://uri.amap.com/marker?position={market.get('lng')},{market.get('lat')}&name={quote(name)}"
    return f"https://uri.amap.com/search?keyword={quote(name)}&city={quote('大理')}"


def baidu_map_link(market: dict[str, Any]) -> str:
    name = clean(market.get("address")) or clean(market.get("location_name")) or clean(market.get("name")) or "大理赶集"
    if has_coordinates(market):
        query = quote(name)
        return (
            "https://api.map.baidu.com/marker?"
            f"location={market.get('lat')},{market.get('lng')}&title={query}&content={query}&output=html"
        )
    return f"https://map.baidu.com/search/{quote(name)}"


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
        else:
            current += char
    chunks.append(current)
    return "\r\n".join(chunks)


def add_property(lines: list[str], name: str, value: Any) -> None:
    lines.append(fold_ical_line(f"{name}:{ical_escape(value)}"))


def build_ics_from_events(events: list[dict[str, Any]], calendar_name: str = CALENDAR_NAME) -> str:
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Dali Ganji Calendar//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    add_property(lines, "X-WR-CALNAME", calendar_name)
    add_property(lines, "X-WR-TIMEZONE", TIMEZONE)

    for event in events:
        event_date = date.fromisoformat(str(event["date"]))
        lines.append("BEGIN:VEVENT")
        add_property(lines, "UID", f"{event['market_id']}-{event_date.isoformat()}@{DOMAIN}")
        lines.append(f"DTSTAMP:{dtstamp}")
        lines.append(f"DTSTART;VALUE=DATE:{event_date.strftime('%Y%m%d')}")
        lines.append(f"DTEND;VALUE=DATE:{(event_date + timedelta(days=1)).strftime('%Y%m%d')}")
        add_property(lines, "SUMMARY", event.get("summary"))
        add_property(lines, "LOCATION", event.get("location"))
        add_property(lines, "DESCRIPTION", event.get("description"))
        if event.get("lat") is not None and event.get("lng") is not None:
            lines.append(f"GEO:{event.get('lat')};{event.get('lng')}")
        lines.append("TRANSP:TRANSPARENT")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
