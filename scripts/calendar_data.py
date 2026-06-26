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

CALENDAR_NAME = "大理赶集日历"
TIMEZONE = "Asia/Shanghai"
DOMAIN = "dali-ganji-calendar"
MONTHS_AHEAD = 18
GUIDE_URL = "https://ganji.neojfeng.store/"


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
    schedule = normalized_schedule(market)
    schedule_type = schedule.get("type")
    if schedule_type == "lunar_days":
        return lunar_market_dates(market, schedule_days(schedule), start, end)
    if schedule_type == "weekdays":
        return weekly_market_dates(market, schedule_days(schedule), start, end)
    if schedule_type == "month_days":
        return gregorian_month_dates(market, schedule_days(schedule), start, end)
    if schedule_type == "interval_days":
        return interval_market_dates(market, schedule, start, end)
    raise ValueError(f"{market.get('id', '<unknown>')}: unsupported schedule_type {schedule_type!r}")


def lunar_market_dates(market: dict[str, Any], lunar_days: list[Any], start: date, end: date) -> list[date]:
    if not isinstance(lunar_days, list):
        raise ValueError(f"{market.get('id', '<unknown>')}: schedule.days must be a list.")

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


def weekly_market_dates(market: dict[str, Any], weekdays: list[Any], start: date, end: date) -> list[date]:
    if not isinstance(weekdays, list) or not weekdays:
        raise ValueError(f"{market.get('id', '<unknown>')}: weekdays schedules need days.")

    wanted = {int(day) for day in weekdays}
    current = start
    dates: list[date] = []
    while current < end:
        current_weekday = (current.weekday() + 1) % 7
        if current_weekday in wanted:
            dates.append(current)
        current += timedelta(days=1)
    return dates


def gregorian_month_dates(market: dict[str, Any], month_days: list[Any], start: date, end: date) -> list[date]:
    if not isinstance(month_days, list) or not month_days:
        raise ValueError(f"{market.get('id', '<unknown>')}: month_days schedules need days.")

    wanted = {int(day) for day in month_days}
    current = start
    dates: list[date] = []
    while current < end:
        if current.day in wanted:
            dates.append(current)
        current += timedelta(days=1)
    return dates


def interval_market_dates(market: dict[str, Any], schedule: dict[str, Any], start: date, end: date) -> list[date]:
    try:
        anchor = date.fromisoformat(clean(schedule.get("start_date")))
        interval = int(schedule.get("interval"))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{market.get('id', '<unknown>')}: interval_days needs start_date and interval.") from exc
    if interval <= 0:
        raise ValueError(f"{market.get('id', '<unknown>')}: interval_days interval must be positive.")

    current = anchor
    if current < start:
        steps = (start - current).days // interval
        current += timedelta(days=steps * interval)
        while current < start:
            current += timedelta(days=interval)

    dates: list[date] = []
    while current < end:
        dates.append(current)
        current += timedelta(days=interval)
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

        location = calendar_location(market)
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
                    "uid": f"{market_id}-{event_date.isoformat()}@{DOMAIN}",
                    "lat": market.get("lat"),
                    "lng": market.get("lng"),
                }
            )

    return sorted(events, key=lambda event: (event["date"], event["market_index"], event["market_id"]))


def public_market_records(markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, market in enumerate(markets):
        name = clean(market.get("name"))
        images = market.get("images") if isinstance(market.get("images"), list) else []
        fallback_image = clean(market.get("image"))
        primary_image = clean(images[0].get("src")) if images and isinstance(images[0], dict) else fallback_image
        primary_alt = clean(images[0].get("alt")) if images and isinstance(images[0], dict) else clean(market.get("image_alt"))
        schedule = normalized_schedule(market)
        records.append(
            {
                "id": clean(market.get("id")),
                "name": name,
                "label": calendar_label(name),
                "location": calendar_location(market),
                "old_town_trip": clean(market.get("old_town_trip")),
                "area": clean(market.get("area")) or "其他",
                "summary": clean(market.get("summary")),
                "tags": clean_list(market.get("tags")),
                "best_for": clean_list(market.get("best_for")),
                "not_for": clean_list(market.get("not_for")),
                "lat": market.get("lat"),
                "lng": market.get("lng"),
                "image": primary_image,
                "image_alt": primary_alt,
                "images": images,
                "schedule": schedule,
                "schedule_text": clean(market.get("schedule_text")),
                "open_text": clean(market.get("open_text")),
                "best_time": clean(market.get("best_time")),
                "duration": clean(market.get("duration")),
                "visit_tips": clean_list(market.get("visit_tips")),
                "what_to_buy": clean_list(market.get("what_to_buy")),
                "food_tips": clean_list(market.get("food_tips")),
                "avoid_pitfalls": clean_list(market.get("avoid_pitfalls")),
                "nearby_places": clean_list(market.get("nearby_places")),
                "order": index,
            }
        )
    return [record for record in records if record["id"] and record["name"]]


def is_calendar_market(market: dict[str, Any]) -> bool:
    return market.get("subscription_enabled") is not False and has_valid_schedule_rule(market)


def has_valid_schedule_rule(market: dict[str, Any]) -> bool:
    schedule = normalized_schedule(market)
    schedule_type = clean(schedule.get("type"))
    if schedule_type in {"lunar_days", "weekdays", "month_days"}:
        return bool(schedule_days(schedule))
    if schedule_type == "interval_days":
        return has_interval_schedule(schedule)
    return False


def normalized_schedule(market: dict[str, Any]) -> dict[str, Any]:
    schedule = market.get("schedule")
    if isinstance(schedule, dict):
        schedule_type = clean(schedule.get("type"))
        days = schedule_days(schedule)
        if schedule_type == "daily":
            return {"type": "daily"}
        if schedule_type in {"lunar_days", "weekdays", "month_days"}:
            return {"type": schedule_type, "days": days}
        if schedule_type == "interval_days":
            return {
                "type": "interval_days",
                "start_date": clean(schedule.get("start_date")),
                "interval": schedule.get("interval"),
            }
        return {"type": schedule_type}

    schedule_type = clean(market.get("schedule_type"))
    if schedule_type == "daily":
        return {"type": "daily"}
    if schedule_type == "lunar_days":
        return {"type": "lunar_days", "days": clean_number_list(market.get("lunar_days"))}
    if schedule_type == "gregorian_month_days":
        return {"type": "month_days", "days": clean_number_list(market.get("month_days"))}
    if schedule_type == "weekday":
        return {"type": "weekdays", "days": clean_number_list(market.get("weekday"))}
    if schedule_type == "weekly":
        return {"type": "weekdays", "days": [((day + 1) % 7) for day in clean_number_list(market.get("weekday", market.get("weekdays", [])))]}
    return {"type": schedule_type}


def has_interval_schedule(schedule: dict[str, Any]) -> bool:
    try:
        date.fromisoformat(clean(schedule.get("start_date")))
        return int(schedule.get("interval")) > 0
    except (TypeError, ValueError):
        return False


def schedule_days(schedule: dict[str, Any]) -> list[Any]:
    return schedule.get("days") if isinstance(schedule.get("days"), list) else []


def clean_number_list(value: Any) -> list[int]:
    if isinstance(value, int):
        value = [value]
    if not isinstance(value, list):
        return []
    days: list[int] = []
    for item in value:
        try:
            days.append(int(item))
        except (TypeError, ValueError):
            continue
    return days


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
    summary = clean(market.get("summary"))
    schedule_text = clean(market.get("schedule_text")) or "时间待补充"
    place = calendar_location(market)
    navigation_url = amap_url(market)

    lines = []
    if summary:
        lines.append(summary)
    lines.append(f"时间：{schedule_text}")
    lines.append(f"地点：{place}")
    if navigation_url:
        lines.append(f"导航（高德）：{navigation_url}")
    lines.append(f"更多赶集攻略或重新订阅日历，请访问：{GUIDE_URL}")
    return "\n".join(lines)


def calendar_location(market: dict[str, Any]) -> str:
    return clean(market.get("location")) or clean(market.get("name")) or "地点待补充"


def amap_url(market: dict[str, Any]) -> str:
    query = quote(calendar_location(market) or "大理赶集")
    lat = market.get("lat")
    lng = market.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return f"https://uri.amap.com/marker?position={lng},{lat}&name={query}"
    return f"https://uri.amap.com/search?keyword={query}&city=大理"


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
        "PRODID:-//Jfeng//Dali Ganji Calendar//ZH-CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    add_property(lines, "X-WR-CALNAME", calendar_name)
    add_property(lines, "X-WR-TIMEZONE", TIMEZONE)

    for event in events:
        event_date = date.fromisoformat(str(event["date"]))
        lines.append("BEGIN:VEVENT")
        add_property(lines, "UID", event.get("uid") or f"{event['market_id']}-{event_date.isoformat()}@{DOMAIN}")
        lines.append(f"DTSTAMP:{dtstamp}")
        lines.append(f"DTSTART;VALUE=DATE:{event_date.strftime('%Y%m%d')}")
        lines.append(f"DTEND;VALUE=DATE:{(event_date + timedelta(days=1)).strftime('%Y%m%d')}")
        add_property(lines, "SUMMARY", event.get("summary"))
        add_property(lines, "LOCATION", event.get("location"))
        add_property(lines, "DESCRIPTION", event.get("description"))
        lines.append("TRANSP:TRANSPARENT")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
