const fs = require("fs");
const path = require("path");

const CALENDAR_NAME = "大理赶集日历";
const TIMEZONE = "Asia/Shanghai";
const DOMAIN = "dali-ganji-calendar";

let cachedMarkets;
let cachedEvents;

module.exports = function handler(req, res) {
  try {
    const markets = loadMarkets();
    const events = loadEvents();
    const selectedMarkets = selectedMarketRecords(req, markets);
    const selectedIds = new Set(selectedMarkets.map((market) => market.id));
    const selectedEvents = events
      .filter((event) => selectedIds.has(event.market_id))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return Number(a.market_index || 0) - Number(b.market_index || 0);
      });

    const ics = buildIcs(selectedEvents, calendarTitle(selectedMarkets));
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
    res.statusCode = 200;
    res.end(ics);
  } catch (error) {
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.statusCode = 200;
    res.end(buildIcs([], CALENDAR_NAME));
  }
};

function loadMarkets() {
  if (!cachedMarkets) {
    cachedMarkets = readJson(path.join(process.cwd(), "data", "markets.json"));
  }
  return cachedMarkets;
}

function loadEvents() {
  if (!cachedEvents) {
    cachedEvents = readJson(path.join(process.cwd(), "public", "events.json"));
  }
  return cachedEvents;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function selectedMarketRecords(req, markets) {
  const requested = new Set(parseMarketIds(req));
  if (requested.size === 0) return [];
  return markets.filter((market) => requested.has(market.id));
}

function parseMarketIds(req) {
  const rawValue = valueFromQuery(req, "markets");
  if (!rawValue) return [];
  return String(rawValue)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function valueFromQuery(req, key) {
  if (req.query && req.query[key] !== undefined) {
    const value = req.query[key];
    return Array.isArray(value) ? value.join(",") : value;
  }

  const host = req.headers && req.headers.host ? `https://${req.headers.host}` : "https://localhost";
  const url = new URL(req.url || "/", host);
  return url.searchParams.get(key);
}

function calendarTitle(markets) {
  if (markets.length === 0) return CALENDAR_NAME;
  if (markets.length === 1) return `${CALENDAR_NAME}｜${marketLabel(markets[0])}`;
  if (markets.length <= 3) {
    return `${CALENDAR_NAME}｜${markets.map(marketLabel).join("、")}`;
  }
  return `${CALENDAR_NAME}｜已选 ${markets.length} 个集市`;
}

function marketLabel(market) {
  const name = String(market.name || market.location_name || "").trim();
  return name.replace(/(赶集|集市)$/u, "");
}

function buildIcs(events, calendarName) {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dali Ganji Calendar//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  addProperty(lines, "X-WR-CALNAME", calendarName);
  addProperty(lines, "X-WR-TIMEZONE", TIMEZONE);

  for (const event of events) {
    const ymd = event.date.replace(/-/g, "");
    lines.push("BEGIN:VEVENT");
    addProperty(lines, "UID", `${event.market_id}-${event.date}@${DOMAIN}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${ymd}`);
    lines.push(`DTEND;VALUE=DATE:${nextDateYmd(event.date)}`);
    addProperty(lines, "SUMMARY", event.summary);
    addProperty(lines, "LOCATION", event.location);
    addProperty(lines, "DESCRIPTION", event.description);
    if (event.lat !== null && event.lat !== undefined && event.lng !== null && event.lng !== undefined) {
      lines.push(`GEO:${event.lat};${event.lng}`);
    }
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function nextDateYmd(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function addProperty(lines, name, value) {
  lines.push(foldIcalLine(`${name}:${icalEscape(value)}`));
}

function icalEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n");
}

function foldIcalLine(line) {
  const chunks = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > 75) {
      chunks.push(current);
      current = ` ${char}`;
    } else {
      current += char;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n");
}
