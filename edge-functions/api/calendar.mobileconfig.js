import { calendarData } from "../_data/calendar-data.js";
import {
  buildMobileConfigProfile,
  decodePathSelectionToMarketIds,
  decodeTokenToMarketIds
} from "../_shared/calendar.js";

const HEADERS = {
  "Content-Type": "application/x-apple-aspen-config; charset=utf-8",
  "Cache-Control": "public, max-age=3600"
};

export async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("s");
    const pathSelection = selectionFromPath(url.pathname);
    const selectedIds = token
      ? decodeTokenToMarketIds(token, calendarData.markets)
      : decodePathSelectionToMarketIds(pathSelection, calendarData.markets);
    const pathStem = selectedIds.length ? selectedIds.join("__") : token || pathSelection || "empty";
    const subscriptionUrl = new URL(`/calendars/${encodeURIComponent(pathStem)}.ics`, url.origin).toString();
    const profile = buildMobileConfigProfile({
      token: token || pathStem,
      selectedMarketIds: selectedIds,
      data: calendarData,
      subscriptionUrl
    });
    return new Response(profile, { status: 200, headers: HEADERS });
  } catch (error) {
    return new Response("", { status: 200, headers: HEADERS });
  }
}

export async function onRequest(context) {
  return handleRequest(context.request);
}

export default {
  fetch: handleRequest
};

function selectionFromPath(pathname) {
  const match = pathname.match(/^\/(?:calendar\/(?:v\d+\/)?|calendars\/)([A-Za-z0-9_-]+)\.mobileconfig$/u);
  return match ? match[1] : "";
}
