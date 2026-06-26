import { calendarData } from "../lib/calendar-data.js";
import {
  buildMobileConfigProfile,
  decodePathSelectionToMarketIds,
  decodeTokenToMarketIds,
  encodeSelectionToToken
} from "../lib/calendar.js";

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
  const token = url.searchParams.get("s");
  const pathSelection = selectionFromPath(url.pathname);
  const selectedIds = token
    ? decodeTokenToMarketIds(token, calendarData.markets)
    : decodePathSelectionToMarketIds(pathSelection, calendarData.markets);
  const selectionToken = token || encodeSelectionToToken(selectedIds, calendarData.markets);
  const pathStem = selectionToken || pathSelection || "empty";
  const subscriptionUrl = new URL(`/api/calendar.ics?s=${encodeURIComponent(pathStem)}`, url.origin).toString();
  return buildMobileConfigProfile({
    token: pathStem,
    selectedMarketIds: selectedIds,
    data: calendarData,
    subscriptionUrl
  });
}

function requestUrl(request) {
  const host = request.headers?.host || "localhost";
  return new URL(request.url || "/api/calendar.mobileconfig", `https://${host}`);
}

function selectionFromPath(pathname) {
  const match = pathname.match(/^\/(?:calendar\/(?:v\d+\/)?|calendars\/)([A-Za-z0-9_,.-]+)\.mobileconfig$/u);
  return match ? match[1] : "";
}
