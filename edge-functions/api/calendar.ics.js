import { calendarData } from "../_data/calendar-data.js";
import {
  buildIcsForMarketIds,
  decodeTokenToMarketIds,
  emptyCalendar
} from "../_shared/calendar.js";

const HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "public, max-age=3600"
};

export async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("s") || tokenFromPath(url.pathname);
    const selectedIds = token ? decodeTokenToMarketIds(token, calendarData.markets) : [];

    const ics = selectedIds.length ? buildIcsForMarketIds(selectedIds, calendarData) : emptyCalendar();
    return new Response(ics, { status: 200, headers: HEADERS });
  } catch (error) {
    return new Response(emptyCalendar(), { status: 200, headers: HEADERS });
  }
}

export async function onRequest(context) {
  return handleRequest(context.request);
}

export default {
  fetch: handleRequest
};

function tokenFromPath(pathname) {
  const match = pathname.match(/^\/(?:calendar\/(?:v\d+\/)?|calendars\/)([A-Za-z0-9_-]+)\.ics$/u);
  return match ? match[1] : "";
}
