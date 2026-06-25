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
  return normalizeSelectedMarketIds(selectedMarketIds, markets).join(",");
}

export function decodeTokenToMarketIds(token, markets) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_,.-]+$/u.test(token)) return [];
  const decoded = decodeURIComponent(token);
  return normalizeSelectedMarketIds(decoded.split(",").filter(Boolean), markets);
}

export function decodePathSelectionToMarketIds(value, markets) {
  if (typeof value !== "string" || !value) return [];
  const decoded = decodeURIComponent(value);
  return decodeTokenToMarketIds(decoded, markets);
}

export function buildIcsForMarketIds(selectedMarketIds, data) {
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const ids = normalizeSelectedMarketIds(selectedMarketIds, markets);
  const selected = new Set(ids);
  const filteredEvents = events
    .filter((event) => selected.has(String(event.market_id)) && isEventSubscribable(event))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.market_id).localeCompare(String(b.market_id)));

  return buildIcsFromEvents(filteredEvents, CALENDAR_NAME);
}

export function buildIcsFromEvents(events, calendarName = CALENDAR_NAME) {
  const dtstamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN"
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

export function buildMobileConfigProfile({ token, selectedMarketIds, data, subscriptionUrl }) {
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const normalizedIds = normalizeSelectedMarketIds(selectedMarketIds, markets);
  const title = calendarTitle(normalizedIds, markets);
  const stableKey = `${subscriptionUrl}#${token || normalizedIds.join(",")}`;
  const profileUuid = stableUuid(`${stableKey}:profile`);
  const calendarUuid = stableUuid(`${stableKey}:calendar`);
  const identifierStem = token || normalizedIds.join(".");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadDescription</key>
      <string>${xmlEscape(`订阅 ${title}`)}</string>
      <key>PayloadDisplayName</key>
      <string>${xmlEscape(title)}</string>
      <key>PayloadIdentifier</key>
      <string>${xmlEscape(`com.jfeng.dali-ganji-calendar.subscribed-calendar.${identifierStem}`)}</string>
      <key>PayloadType</key>
      <string>com.apple.subscribedcalendar.account</string>
      <key>PayloadUUID</key>
      <string>${calendarUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>SubCalAccountDescription</key>
      <string>${xmlEscape(title)}</string>
      <key>SubCalAccountHostName</key>
      <string>${xmlEscape(subscriptionUrl)}</string>
      <key>SubCalAccountUseSSL</key>
      <true/>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>${xmlEscape(`安装后会添加订阅日历：${title}`)}</string>
  <key>PayloadDisplayName</key>
  <string>${xmlEscape(title)}</string>
  <key>PayloadIdentifier</key>
  <string>${xmlEscape(`com.jfeng.dali-ganji-calendar.profile.${identifierStem}`)}</string>
  <key>PayloadOrganization</key>
  <string>${xmlEscape(CALENDAR_NAME)}</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileUuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

function isSubscribableMarket(market) {
  return (
    market &&
    String(market.id || "") &&
    market.subscription_enabled !== false &&
    hasSubscribableSchedule(market.schedule)
  );
}

function hasSubscribableSchedule(schedule) {
  return (
    schedule &&
    ["lunar_days", "weekdays", "month_days"].includes(schedule.type) &&
    Array.isArray(schedule.days) &&
    schedule.days.length > 0
  );
}

function isEventSubscribable(event) {
  return Boolean(event);
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

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function stableUuid(value) {
  const bytes = cyrb128(value);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}

function cyrb128(value) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  const output = new Uint8Array(16);
  new DataView(output.buffer).setUint32(0, h1 >>> 0);
  new DataView(output.buffer).setUint32(4, h2 >>> 0);
  new DataView(output.buffer).setUint32(8, h3 >>> 0);
  new DataView(output.buffer).setUint32(12, h4 >>> 0);
  return output;
}
