const CALENDAR_NAME = "大理赶集日历";
const TIMEZONE = "Asia/Shanghai";
const PRODID = "-//Jfeng//Dali Ganji Calendar//ZH-CN";
const DOMAIN = "dali-ganji-calendar";

export function getSubscribableMarkets(markets) {
  return (Array.isArray(markets) ? markets : []).filter((market) => isSubscribableMarket(market));
}

export function normalizeSelectedMarketIds(selectedMarketIds, markets) {
  const selected = new Set(Array.isArray(selectedMarketIds) ? selectedMarketIds.map((id) => String(id)) : []);
  return getSubscribableMarkets(markets)
    .filter((market) => selected.has(String(market.id)))
    .map((market) => String(market.id));
}

export function encodeSelectionToToken(selectedMarketIds, markets) {
  const subscribable = getSubscribableMarkets(markets);
  const selected = new Set(normalizeSelectedMarketIds(selectedMarketIds, markets));
  if (!selected.size) return "";

  const bytes = new Uint8Array(Math.ceil(subscribable.length / 8));
  subscribable.forEach((market, index) => {
    if (selected.has(String(market.id))) {
      bytes[Math.floor(index / 8)] |= 1 << (index % 8);
    }
  });

  return bytesToBase64Url(trimTrailingZeroBytes(bytes));
}

export function decodeTokenToMarketIds(token, markets) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]+$/u.test(token)) return [];
  const bytes = base64UrlToBytes(token);
  if (!bytes) return [];

  const subscribable = getSubscribableMarkets(markets);
  const ids = [];
  subscribable.forEach((market, index) => {
    const byte = bytes[Math.floor(index / 8)] || 0;
    if (byte & (1 << (index % 8))) {
      ids.push(String(market.id));
    }
  });
  return ids;
}

export function buildIcsForMarketIds(selectedMarketIds, data) {
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const ids = normalizeSelectedMarketIds(selectedMarketIds, markets);
  const selected = new Set(ids);
  const filteredEvents = events
    .filter((event) => selected.has(String(event.market_id)) && isEventSubscribable(event))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.market_id).localeCompare(String(b.market_id)));

  return buildIcsFromEvents(filteredEvents, calendarTitle(ids, markets));
}

export function buildIcsFromEvents(events, calendarName = CALENDAR_NAME) {
  const dtstamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];
  addProperty(lines, "X-WR-CALNAME", calendarName);
  addProperty(lines, "X-WR-TIMEZONE", TIMEZONE);

  for (const event of Array.isArray(events) ? events : []) {
    const ymd = String(event.date || "").replaceAll("-", "");
    if (!/^\d{8}$/u.test(ymd)) continue;

    lines.push("BEGIN:VEVENT");
    addProperty(lines, "UID", event.uid || `${event.market_id}-${event.date}@${DOMAIN}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${ymd}`);
    addProperty(lines, "SUMMARY", event.summary || event.market_name);
    addProperty(lines, "LOCATION", event.location || "");
    addProperty(lines, "DESCRIPTION", event.description || "");
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function emptyCalendar() {
  return buildIcsFromEvents([], CALENDAR_NAME);
}

function isSubscribableMarket(market) {
  return (
    market &&
    String(market.id || "") &&
    market.market_type === "periodic_fair" &&
    market.calendar_enabled === true &&
    market.verification_status === "verified" &&
    hasValidScheduleRule(market)
  );
}

function hasValidScheduleRule(market) {
  if (market.schedule_type === "lunar_days") return Array.isArray(market.lunar_days) && market.lunar_days.length > 0;
  if (market.schedule_type === "weekly") {
    return typeof market.weekday === "number" || (Array.isArray(market.weekday) && market.weekday.length > 0);
  }
  if (market.schedule_type === "gregorian_month_days") {
    return Array.isArray(market.month_days) && market.month_days.length > 0;
  }
  return false;
}

function isEventSubscribable(event) {
  return event.calendar_enabled === true && event.verification_status === "verified";
}

function calendarTitle(selectedIds, markets) {
  if (!selectedIds.length) return CALENDAR_NAME;
  const marketById = new Map(markets.map((market) => [String(market.id), market]));
  const labels = selectedIds
    .map((id) => marketById.get(id)?.label || marketById.get(id)?.market_label || marketById.get(id)?.name)
    .filter(Boolean);
  if (labels.length === 1) return `${CALENDAR_NAME}｜${labels[0]}`;
  if (labels.length <= 3) return `${CALENDAR_NAME}｜${labels.join("、")}`;
  return `${CALENDAR_NAME}｜已选 ${labels.length} 个集市`;
}

function addProperty(lines, name, value) {
  lines.push(foldIcalLine(`${name}:${icalEscape(value)}`));
}

function icalEscape(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/gu, "\\\\")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n")
    .replace(/\n/gu, "\\n");
}

function foldIcalLine(line) {
  const chunks = [];
  let current = "";
  for (const char of line) {
    if (new TextEncoder().encode(current + char).length > 75) {
      chunks.push(current);
      current = ` ${char}`;
    } else {
      current += char;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function trimTrailingZeroBytes(bytes) {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return bytes.slice(0, end);
}

function base64UrlToBytes(token) {
  try {
    const padded = token.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch (error) {
    return null;
  }
}
