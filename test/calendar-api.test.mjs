import assert from "node:assert/strict";
import { test } from "node:test";

import { calendarData } from "../edge-functions/_data/calendar-data.js";
import { handleRequest } from "../edge-functions/api/calendar.ics.js";
import vercelHandler from "../api/calendar.ics.js";
import {
  buildIcsForMarketIds,
  buildIcsFromEvents,
  decodeTokenToMarketIds,
  encodeSelectionToToken,
  getSubscribableMarkets,
  normalizeSelectedMarketIds
} from "../edge-functions/_shared/calendar.js";

test("selection token round-trips and ignores click order", () => {
  const selected = ["yinqiaojie", "sanyuejie", "fengyijie"];
  const reordered = ["fengyijie", "yinqiaojie", "sanyuejie"];

  const token = encodeSelectionToToken(selected, calendarData.markets);
  assert.equal(token, encodeSelectionToToken(reordered, calendarData.markets));
  assert.deepEqual(decodeTokenToMarketIds(token, calendarData.markets), normalizeSelectedMarketIds(selected, calendarData.markets));
});

test("disabled, unverified, permanent, and unscheduled markets are not subscribable", () => {
  const fixtureMarkets = [
    { id: "ok", market_type: "periodic_fair", calendar_enabled: true, verification_status: "verified", schedule_type: "weekly", weekday: [5] },
    { id: "disabled", market_type: "periodic_fair", calendar_enabled: false, verification_status: "verified", schedule_type: "weekly", weekday: [5] },
    { id: "unverified", market_type: "periodic_fair", calendar_enabled: true, verification_status: "needs_verification", schedule_type: "weekly", weekday: [5] },
    { id: "permanent", market_type: "permanent_market", calendar_enabled: true, verification_status: "verified", schedule_type: "weekly", weekday: [5] },
    { id: "unscheduled", market_type: "periodic_fair", calendar_enabled: true, verification_status: "verified", schedule_type: "weekly", weekday: [] }
  ];

  assert.deepEqual(getSubscribableMarkets(fixtureMarkets).map((market) => market.id), ["ok"]);
  assert.deepEqual(normalizeSelectedMarketIds(fixtureMarkets.map((market) => market.id), fixtureMarkets), ["ok"]);
});

test("calendar API returns text/calendar for a valid token", async () => {
  const selected = getSubscribableMarkets(calendarData.markets).slice(0, 1).map((market) => market.id);
  const token = encodeSelectionToToken(selected, calendarData.markets);
  const response = await handleRequest(new Request(`https://example.com/api/calendar.ics?s=${token}`));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/calendar; charset=utf-8");
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, new RegExp(`UID:${selected[0]}-`));
});

test("Vercel API handler returns the same dynamic ICS response", async () => {
  const selected = ["sanyuejie", "yinqiaojie"];
  const token = encodeSelectionToToken(selected, calendarData.markets);
  const response = await invokeVercelHandler(`/api/calendar.ics?s=${token}`);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/calendar; charset=utf-8");
  assert.equal(response.headers["Cache-Control"], "public, max-age=3600");
  assert.match(response.body, /三月街赶集/);
  assert.match(response.body, /银桥街集市/);
  assert.doesNotMatch(response.body, /北门菜市场/);
});

test("clean calendar feed URL works for subscription clients", async () => {
  const token = encodeSelectionToToken(["sanyuejie", "yinqiaojie"], calendarData.markets);
  const edgeResponse = await handleRequest(new Request(`https://example.com/calendar/${token}.ics`));
  const vercelResponse = await invokeVercelHandler(`/calendar/${token}.ics`);
  const edgeBody = await edgeResponse.text();

  assert.equal(edgeResponse.status, 200);
  assert.match(edgeBody, /X-PUBLISHED-TTL:PT1H/);
  assert.match(edgeBody, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  assert.match(edgeBody, /三月街赶集/);
  assert.match(vercelResponse.body, /银桥街集市/);
});

test("calendar API returns an empty calendar for an invalid token without crashing", async () => {
  const response = await handleRequest(new Request("https://example.com/api/calendar.ics?s=!!!!"));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.doesNotMatch(body, /BEGIN:VEVENT/);
});

test("generated ICS contains selected markets and excludes unselected markets", () => {
  const selected = ["sanyuejie"];
  const ics = buildIcsForMarketIds(selected, calendarData);

  assert.match(ics, /三月街赶集/);
  assert.doesNotMatch(ics, /银桥街集市/);
});

test("Chinese fields, commas, semicolons, backslashes, and description newlines are escaped", () => {
  const ics = buildIcsFromEvents([
    {
      market_id: "escape-test",
      date: "2026-07-01",
      summary: "中文,分号;反斜杠\\",
      location: "大理,古城;测试",
      description: "第一行\n第二行,带逗号;和反斜杠\\",
      calendar_enabled: true,
      verification_status: "verified"
    }
  ]);

  assert.match(ics, /SUMMARY:中文\\,分号\\;反斜杠\\\\/);
  assert.match(ics, /LOCATION:大理\\,古城\\;测试/);
  assert.match(ics, /DESCRIPTION:第一行\\n第二行\\,带逗号\\;和反斜杠\\\\/);
});

async function invokeVercelHandler(url) {
  const result = {
    headers: {},
    statusCode: undefined,
    body: ""
  };
  await vercelHandler(
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
