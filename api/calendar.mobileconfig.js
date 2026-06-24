import { calendarData } from "../edge-functions/_data/calendar-data.js";
import {
  buildMobileConfigProfile,
  decodeTokenToMarketIds
} from "../edge-functions/_shared/calendar.js";

const HEADERS = {
  "Content-Type": "application/x-apple-aspen-config; charset=utf-8",
  "Cache-Control": "public, max-age=3600"
};

export default async function handler(request, response) {
  const profile = buildProfileResponse(request);
  response.statusCode = 200;
  for (const [name, value] of Object.entries(HEADERS)) {
    response.setHeader(name, value);
  }
  response.end(profile);
}

export function buildProfileResponse(request) {
  const url = requestUrl(request);
  const token = url.searchParams.get("s") || tokenFromPath(url.pathname);
  const selectedIds = token ? decodeTokenToMarketIds(token, calendarData.markets) : [];
  const subscriptionUrl = new URL(`/calendar/v3/${encodeURIComponent(token || "empty")}.ics`, url.origin).toString();
  return buildMobileConfigProfile({
    token,
    selectedMarketIds: selectedIds,
    data: calendarData,
    subscriptionUrl
  });
}

function requestUrl(request) {
  const host = request.headers?.host || "localhost";
  return new URL(request.url || "/api/calendar.mobileconfig", `https://${host}`);
}

function tokenFromPath(pathname) {
  const match = pathname.match(/^\/calendar\/(?:v\d+\/)?([A-Za-z0-9_-]+)\.mobileconfig$/u);
  return match ? match[1] : "";
}
