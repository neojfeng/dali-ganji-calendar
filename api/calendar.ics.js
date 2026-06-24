import { calendarData } from "../edge-functions/_data/calendar-data.js";
import {
  buildIcsForMarketIds,
  decodeTokenToMarketIds,
  emptyCalendar
} from "../edge-functions/_shared/calendar.js";

const HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "public, max-age=3600"
};

export default async function handler(request, response) {
  const ics = buildCalendarResponse(request);
  response.statusCode = 200;
  for (const [name, value] of Object.entries(HEADERS)) {
    response.setHeader(name, value);
  }
  response.end(ics);
}

export function buildCalendarResponse(request) {
  try {
    const url = requestUrl(request);
    const token = url.searchParams.get("s") || tokenFromPath(url.pathname);
    const selectedIds = token ? decodeTokenToMarketIds(token, calendarData.markets) : [];
    return selectedIds.length ? buildIcsForMarketIds(selectedIds, calendarData) : emptyCalendar();
  } catch (error) {
    return emptyCalendar();
  }
}

function requestUrl(request) {
  const host = request.headers?.host || "localhost";
  return new URL(request.url || "/api/calendar.ics", `https://${host}`);
}

function tokenFromPath(pathname) {
  const match = pathname.match(/^\/(?:calendar\/(?:v\d+\/)?|calendars\/)([A-Za-z0-9_-]+)\.ics$/u);
  return match ? match[1] : "";
}
