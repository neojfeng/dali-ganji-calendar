import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { calendarData } from "../lib/calendar-data.js";
import vercelHandler from "../api/calendar.ics.js";
import vercelMobileConfigHandler from "../api/calendar.mobileconfig.js";
import {
  buildIcsForMarketIds,
  buildIcsFromEvents,
  decodeTokenToMarketIds,
  encodeSelectionToToken,
  getSubscribableMarkets,
  normalizeSelectedMarketIds
} from "../lib/calendar.js";

test("selection token round-trips and ignores click order", () => {
  const selected = ["yinqiaojie", "sanyuejie", "fengyijie"];
  const reordered = ["fengyijie", "yinqiaojie", "sanyuejie"];

  const token = encodeSelectionToToken(selected, calendarData.markets);
  assert.equal(token, normalizeSelectedMarketIds(selected, calendarData.markets).join(","));
  assert.equal(token, encodeSelectionToToken(reordered, calendarData.markets));
  assert.deepEqual(decodeTokenToMarketIds(token, calendarData.markets), normalizeSelectedMarketIds(selected, calendarData.markets));
});

test("comma-separated selection tokens decode by market id", () => {
  const selected = ["sanyuejie", "yinqiaojie"];
  const reorderedMarkets = [...calendarData.markets].reverse();
  const token = encodeSelectionToToken(selected, calendarData.markets);

  assert.equal(token, "sanyuejie,yinqiaojie");
  assert.deepEqual(decodeTokenToMarketIds(token, calendarData.markets), normalizeSelectedMarketIds(selected, calendarData.markets));
  assert.deepEqual(decodeTokenToMarketIds(token, reorderedMarkets), normalizeSelectedMarketIds(selected, reorderedMarkets));
});

test("disabled, daily, and unscheduled markets are not subscribable", () => {
  const fixtureMarkets = [
    { id: "ok", schedule: { type: "weekdays", days: [5] } },
    { id: "creative", schedule: { type: "weekdays", days: [0] } },
    { id: "interval", schedule: { type: "interval_days", start_date: "2026-01-05", interval: 6 } },
    { id: "disabled", subscription_enabled: false, schedule: { type: "weekdays", days: [5] } },
    { id: "daily", schedule: { type: "daily" } },
    { id: "unscheduled", schedule: { type: "weekdays", days: [] } }
  ];

  assert.deepEqual(getSubscribableMarkets(fixtureMarkets).map((market) => market.id), ["ok", "creative", "interval"]);
  assert.deepEqual(normalizeSelectedMarketIds(fixtureMarkets.map((market) => market.id), fixtureMarkets), ["ok", "creative", "interval"]);
});

test("Vercel API handler returns text/calendar for a valid token", async () => {
  const selected = getSubscribableMarkets(calendarData.markets).slice(0, 1).map((market) => market.id);
  const token = encodeSelectionToToken(selected, calendarData.markets);
  const response = await invokeVercelHandler(`/api/calendar.ics?s=${token}`);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/calendar; charset=utf-8");
  assert.equal(response.headers["Cache-Control"], "public, max-age=3600");
  assert.match(response.body, /BEGIN:VCALENDAR/);
  assert.match(response.body, /PRODID:-\/\/Jfeng\/\/Dali Ganji Calendar\/\/ZH-CN/);
  assert.match(response.body, /X-WR-CALNAME:大理赶集日历/);
  assert.match(response.body, /X-WR-TIMEZONE:Asia\/Shanghai/);
  assert.match(response.body, new RegExp(`UID:${selected[0]}-`));
  assert.doesNotMatch(response.body, /<!doctype html/i);
});

test("clean calendar feed URL works with comma-separated market ids", async () => {
  const path = "/calendars/sanyuejie,yinqiaojie.ics";
  const vercelResponse = await invokeVercelHandler(path);

  assert.equal(vercelResponse.statusCode, 200);
  assert.match(vercelResponse.body, /三月街/);
  assert.match(vercelResponse.body, /银桥街/);
  assert.doesNotMatch(vercelResponse.body, /北门菜市场/);
});

test("frontend builds webcal and HTTPS subscription links from the selection token", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /<a class="subscribe-button" id="subscribeButton" href="#"/);
  assert.match(html, /webcal:\/\/\$\{host\}\$\{path\}/);
  assert.match(html, /https:\/\/\$\{host\}\$\{path\}/);
  assert.match(html, /\/api\/calendar\.ics\?s=\$\{encodeURIComponent\(token\)\}/);
  assert.match(html, /请先订阅一个集市/);
  assert.doesNotMatch(html, /data:text\/calendar/);
  assert.doesNotMatch(html, /new Blob/);
  assert.doesNotMatch(html, /calendars\/\$\{ids\.join/);
});

test("frontend treats daily markets as always-open instead of pending verification", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /function isAlwaysOpenMarket/);
  assert.match(html, /market\?\.schedule\?\.type === "daily"/);
  assert.match(html, /if \(isAlwaysOpenMarket\(market\)\)/);
  assert.match(html, /每天开集/);
});

test("market detail back button restores the home scroll position", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /let homeScrollY = 0/);
  assert.match(html, /window\.history\.replaceState\(\{ view: "home", scrollY: homeScrollY \}/);
  assert.match(html, /window\.history\.pushState\(\{ view: "home", scrollY: homeScrollY \}/);
  assert.match(html, /function restoreHomeScroll/);
});

test("source market data uses unified schedule objects and location fields", async () => {
  const markets = JSON.parse(await readFile(new URL("../data/markets.json", import.meta.url), "utf8"));
  const deprecatedFields = ["market_type", "calendar_enabled", "schedule_type", "lunar_days", "weekday", "month_days", "address", "location_name"];

  assert.ok(markets.every((market) => market.schedule && typeof market.schedule.type === "string"));
  for (const market of markets) {
    assert.equal(typeof market.location, "string", `${market.id} should include location`);
    assert.ok(market.location.length > 0, `${market.id} location should not be empty`);
    for (const field of deprecatedFields) {
      assert.equal(Object.hasOwn(market, field), false, `${market.id} should not include ${field}`);
    }
  }
});

test("frontend filters and market location labels match current groups", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const markets = JSON.parse(await readFile(new URL("../data/markets.json", import.meta.url), "utf8"));

  assert.match(html, /古城周边集市/);
  assert.match(html, /银桥\/喜洲片区/);
  assert.match(html, /下关市区集市/);
  assert.match(html, /其他乡镇集市/);
  for (const market of markets) {
    assert.doesNotMatch(market.location, /\/|一带|附近|或/, `${market.id} location should be a short map label`);
  }
  assert.doesNotMatch(html, /location_name/);
});

test("mobileconfig endpoint installs a subscribed calendar account", async () => {
  const token = encodeSelectionToToken(["sanyuejie", "yinqiaojie"], calendarData.markets);
  const encodedToken = encodeURIComponent(token);
  const vercelResponse = await invokeVercelHandler("/calendars/sanyuejie,yinqiaojie.mobileconfig", vercelMobileConfigHandler);

  assert.equal(vercelResponse.statusCode, 200);
  assert.equal(vercelResponse.headers["Content-Type"], "application/x-apple-aspen-config; charset=utf-8");
  assert.match(vercelResponse.body, /com\.apple\.subscribedcalendar\.account/);
  assert.match(vercelResponse.body, new RegExp(`https://example\\.com/api/calendar\\.ics\\?s=${encodedToken}`));
  assert.match(vercelResponse.body, /大理赶集日历/);
});

test("calendar API returns an empty calendar for an invalid token without crashing", async () => {
  const response = await invokeVercelHandler("/api/calendar.ics?s=!!!!");

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /BEGIN:VCALENDAR/);
  assert.doesNotMatch(response.body, /BEGIN:VEVENT/);
});

test("generated ICS contains selected markets and excludes unselected markets", () => {
  const selected = ["sanyuejie"];
  const ics = buildIcsForMarketIds(selected, calendarData);

  assert.match(ics, /三月街/);
  assert.doesNotMatch(ics, /银桥街/);
});

test("calendar event descriptions use short places and include Gaode navigation", () => {
  const event = calendarData.events.find((item) => item.market_id === "chuangdanchang");
  assert.ok(event);
  const description = event?.description ?? "";

  assert.equal(event.location, "床单厂艺术区");
  assert.match(description, /时间：/);
  assert.match(description, new RegExp(`地点：${escapeRegExp(event.location)}`));
  assert.match(description, /导航（高德）：https:\/\/uri\.amap\.com\/marker\?position=/);
  assert.match(description, /更多赶集攻略或重新订阅日历，请访问：https:\/\/ganji\.neojfeng\.store\//);
  assert.doesNotMatch(description, /大理市大理古城苍坪街56号/);
  assert.doesNotMatch(description, /提醒：|数据说明：/);
});

test("generated market payloads omit deprecated address fields", () => {
  assert.ok(calendarData.markets.every((market) => !Object.hasOwn(market, "address")));
  assert.ok(calendarData.markets.every((market) => !Object.hasOwn(market, "location_name")));
  assert.ok(calendarData.markets.every((market) => typeof market.location === "string" && market.location.length > 0));
});

test("weekdays schedule type treats 0 as Sunday", () => {
  const sundayEvents = calendarData.events.filter((event) => event.market_id === "xiaguan_huaniao");

  assert.ok(sundayEvents.length > 0);
  assert.ok(sundayEvents.every((event) => new Date(`${event.date}T00:00:00Z`).getUTCDay() === 0));
});

test("interval_days schedule generates a six-day cycle", () => {
  const shuanglangDates = calendarData.events
    .filter((event) => event.market_id === "shuanglangjie")
    .slice(0, 6)
    .map((event) => new Date(`${event.date}T00:00:00Z`));

  assert.equal(shuanglangDates.length, 6);
  for (let index = 1; index < shuanglangDates.length; index += 1) {
    const diffDays = (shuanglangDates[index] - shuanglangDates[index - 1]) / 86400000;
    assert.equal(diffDays, 6);
  }
});

test("Chinese fields, commas, semicolons, backslashes, and description newlines are escaped", () => {
  const ics = buildIcsFromEvents([
    {
      market_id: "escape-test",
      date: "2026-07-01",
      summary: "中文,分号;反斜杠\\",
      location: "大理,古城;测试",
      description: "第一行\n第二行,带逗号;和反斜杠\\"
    }
  ]);

  assert.match(ics, /SUMMARY:中文\\,分号\\;反斜杠\\\\/);
  assert.match(ics, /LOCATION:大理\\,古城\\;测试/);
  assert.match(ics, /DESCRIPTION:第一行\\n第二行\\,带逗号\\;和反斜杠\\\\/);
});

async function invokeVercelHandler(url, handler = vercelHandler) {
  const result = {
    headers: {},
    statusCode: undefined,
    body: ""
  };
  await handler(
    {
      url,
      headers: {
        host: "example.com"
      }
    },
    {
      setHeader(name, value) {
        result.headers[name] = value;
      },
      set statusCode(value) {
        result.statusCode = value;
      },
      get statusCode() {
        return result.statusCode;
      },
      end(body) {
        result.body = body;
      }
    }
  );
  return result;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
