import { calendarData } from "../_data/calendar-data.js";
import {
  buildMobileConfigProfile,
  decodeTokenToMarketIds
} from "../_shared/calendar.js";

const HEADERS = {
  "Content-Type": "application/x-apple-aspen-config; charset=utf-8",
  "Cache-Control": "public, max-age=3600"
};

export async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("s") || tokenFromPath(url.pathname);
    const selectedIds = token ? decodeTokenToMarketIds(token, calendarData.markets) : [];
    const subscriptionUrl = new URL(`/calendar/${encodeURIComponent(token || "empty")}.ics`, url.origin).toString();
    const profile = buildMobileConfigProfile({
      token,
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

function tokenFromPath(pathname) {
  const match = pathname.match(/^\/calendar\/([A-Za-z0-9_-]+)\.mobileconfig$/u);
  return match ? match[1] : "";
}
