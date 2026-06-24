# 大理赶集攻略 + 动态 Apple 日历订阅

这是一个移动端优先的“大理赶集攻略”小工具。首页、详情页、图片和公开数据保持静态化；用户选择常去集市后，页面生成短订阅 URL，由 EdgeOne Edge Function 动态返回对应 ICS 日历。

## 项目结构

1. `data/markets.json` 是唯一的集市配置源。
2. `scripts/generate_events.py` 生成未来 18 个月事件到 `public/events.json`，并生成前端使用的 `public/markets.json`。
3. `scripts/generate_calendar_data.py` 生成 `edge-functions/_data/calendar-data.js`，供 Edge Function import。
4. `scripts/build-static.mjs` 把 `public/` 复制到 `dist/`。
5. `edge-functions/api/calendar.ics.js` 根据 `s` token 动态生成 ICS。
6. `edge-functions/api/calendar.mobileconfig.js` 可作为 iOS 配置描述文件备选入口，但页面主按钮默认使用 `webcal://` 订阅源。

订阅链接格式：

```text
https://example.com/calendars/BQ.ics
webcal://example.com/calendars/BQ.ics
```

## 选择 Token

token 不依赖数据库。它只基于 `markets.json` 中可订阅集市的顺序：

1. 可订阅集市按 `markets.json` 顺序分配 index。
2. 用户选择用 bitset 表示。
3. bitset 编码为 base64url 短字符串。
4. 解码时忽略超出当前集市数量的 bit。
5. 如果 token 包含后来被禁用或改为 `needs_verification` 的集市，接口会过滤掉它，不生成事件。

共享函数在 `edge-functions/_shared/calendar.js`：

- `getSubscribableMarkets(markets)`
- `encodeSelectionToToken(selectedMarketIds, markets)`
- `decodeTokenToMarketIds(token, markets)`
- `normalizeSelectedMarketIds(selectedMarketIds, markets)`

## 哪些地点会生成日历事件

只有同时满足以下条件的地点才会生成 ICS 事件：

- `market_type` 是 `periodic_fair`
- `calendar_enabled` 是 `true`
- `verification_status` 是 `verified`
- 有有效 `schedule_type` 和日期规则

以下地点不会生成日历事件：

- `permanent_market` 常设市场
- `verification_status: "needs_verification"`
- `calendar_enabled: false`
- 没有日期规则的地点

## 本地开发

安装 Python 依赖：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

构建静态输出和 Edge 数据模块：

```bash
npm run build
```

如果本机没有 `npm`，也可以直接执行：

```bash
.venv/bin/python scripts/generate_events.py
.venv/bin/python scripts/generate_calendar_data.py
node scripts/build-static.mjs
```

本地仅预览静态页面：

```bash
python3 -m http.server 8000 --directory dist
```

打开：

```text
http://localhost:8000
http://localhost:8000/?market=sanyuejie
```

本地完整调试 Edge Function 可使用 EdgeOne Makers：

```bash
npm run dev
```

## 构建和测试

构建：

```bash
npm run build
```

测试：

```bash
npm test
```

测试覆盖 token 双向转换、点击顺序稳定性、不可订阅地点过滤、有效和无效 `/api/calendar.ics?s=...` 响应、静态风格订阅源 URL、mobileconfig 配置、选中/未选中集市筛选、中文转义和 description 换行。

手动测试动态 ICS：

```text
https://your-domain.example/calendars/BQ.ics
webcal://your-domain.example/calendars/BQ.ics
```

响应头应包含：

```text
Content-Type: text/calendar; charset=utf-8
Cache-Control: public, max-age=3600
```

## EdgeOne Pages / Makers 部署

建议配置：

- Framework Preset: `None` / `Static`
- Root Directory: `./`
- Install Command: `npm install && python3 -m pip install -r requirements.txt`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node Version: `20` 或 `22`

Edge Function 文件位于：

```text
edge-functions/api/calendar.ics.js
edge-functions/api/calendar.mobileconfig.js
```

目标访问路由：

```text
/api/calendar.ics?s={selection_token}
/api/calendar.mobileconfig?s={selection_token}
```

## iPhone 日历订阅

1. 打开首页，选择一个或多个集市。
2. 点击底部“生成日历”。
3. Safari 中点“一键订阅 Apple 日历”，页面会打开 `webcal://` 订阅链接。
4. 按系统提示订阅日历。
5. 添加后可在 iPhone 日历列表中单独关闭显示或删除。

小红书、微信等内置浏览器可能无法安装订阅配置。这时点击“复制订阅链接”，再到 iPhone 日历里手动添加订阅日历。

如果看到 “Events” 事件列表，请取消；那是导入一次性事件，不是订阅日历。

## 新增集市

1. 在 `data/markets.json` 追加对象。
2. 填写稳定的 `id`，后续不要随意修改；它会进入事件 UID 和订阅 token 的选择顺序。
3. 周期性赶集点设置 `market_type: "periodic_fair"`。
4. 确认日期可靠后设置 `calendar_enabled: true` 和 `verification_status: "verified"`。
5. 填写 `schedule_type` 与对应规则。
6. 补充 `summary`、攻略字段、地点、坐标和图片。
7. 运行 `npm run build` 和 `npm test`。

支持的日期规则：

```json
{ "schedule_type": "lunar_days", "lunar_days": [2, 9, 16, 23] }
```

```json
{ "schedule_type": "weekly", "weekday": [5, 6] }
```

```json
{ "schedule_type": "gregorian_month_days", "month_days": [5, 10, 15, 20, 25, 30] }
```

`weekday` 使用 Python 编号：周一是 `0`，周日是 `6`。

## 禁用或待核实集市

不确定日期时不要删除集市。优先这样处理：

```json
{
  "calendar_enabled": false,
  "verification_status": "needs_verification"
}
```

这样攻略页仍可保留信息，已有订阅 token 即使包含它，也不会继续生成事件。

常设市场使用：

```json
{
  "market_type": "permanent_market",
  "calendar_enabled": false
}
```

## 更新赶集规则

token 只记录选择了哪些 market index，不记录具体事件。只要 `id` 和 `markets.json` 中已有可订阅集市顺序保持稳定，更新赶集规则后，订阅链接会在下一次日历刷新时自动拿到新事件。

维护规则：

1. 不要随意重排已有可订阅集市。
2. 不要随意修改已有 `id`。
3. 新增集市尽量追加到列表后面。
4. 如果必须下线某个集市，设置 `calendar_enabled: false` 或 `verification_status: "needs_verification"`。
