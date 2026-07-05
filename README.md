# 大理赶集攻略 + 动态 Apple 日历订阅

这是一个移动端优先的“大理赶集攻略”小工具。首页、详情页、图片和公开数据保持静态化；用户进入日历页时默认包含全部可订阅集市，也可以手动删除不需要的集市，页面生成短订阅 URL，由 Vercel Serverless Function 动态返回对应 ICS 日历。

## 项目结构

1. `data/markets.json` 是唯一的集市配置源。
2. `scripts/generate_events.py` 生成未来 18 个月事件到 `public/events.json`，并生成前端使用的 `public/markets.json`。
3. `scripts/generate_calendar_data.py` 生成 `lib/calendar-data.js`，供日历 API import。
4. `scripts/build-static.mjs` 把 `public/` 复制到 `dist/`。
5. `api/calendar.ics.js` 根据 `s` token 动态生成 ICS。
6. `api/calendar.mobileconfig.js` 可作为 iOS 配置描述文件备选入口，但页面主按钮默认使用 `webcal://` 订阅源。

订阅链接格式：

```text
https://example.com/api/calendar.ics?s=sanyuejie,yinqiaojie
webcal://example.com/api/calendar.ics?s=sanyuejie,yinqiaojie
```

## 选择 Token

token 不依赖数据库，也不保存攻略内容。它直接记录当前日历包含的稳定 `market id`：

1. 单个集市：`s=sanyuejie`
2. 多个集市：`s=sanyuejie,yinqiaojie`
3. 解码时只保留当前仍可订阅的 `market id`。
4. 更新攻略、地点或赶集规则后，订阅链接不变；Apple 日历下次刷新订阅源时会拿到最新 ICS。

共享函数在 `lib/calendar.js`：

- `getSubscribableMarkets(markets)`
- `encodeSelectionToToken(selectedMarketIds, markets)`
- `decodeTokenToMarketIds(token, markets)`
- `normalizeSelectedMarketIds(selectedMarketIds, markets)`

## 哪些地点会生成日历事件

只有同时满足以下条件的地点才会生成 ICS 事件：

- `schedule.type` 是 `lunar_days`、`weekdays` 或 `month_days`
- `schedule.days` 是非空数组
- 或 `schedule.type` 是 `interval_days`，并有有效 `start_date` 和 `interval`
- 没有显式设置 `subscription_enabled: false`

以下地点不会生成日历事件：

- `schedule.type: "daily"` 每天开的市场
- `subscription_enabled: false`
- 没有日期规则的地点

## 本地开发

安装 Python 依赖：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

构建静态输出和日历 API 数据模块：

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

本地完整调试 Vercel API 可使用 Vercel CLI：

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
https://your-domain.example/api/calendar.ics?s=sanyuejie,yinqiaojie
webcal://your-domain.example/api/calendar.ics?s=sanyuejie,yinqiaojie
```

响应头应包含：

```text
Content-Type: text/calendar; charset=utf-8
Cache-Control: public, max-age=3600
```

## Vercel 部署

建议配置：

- Framework Preset: `None` / `Static`
- Root Directory: `./`
- Install Command: `npm install && python3 -m pip install -r requirements.txt`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node Version: `20` 或 `22`

Vercel Function 文件位于：

```text
api/calendar.ics.js
api/calendar.mobileconfig.js
```

目标访问路由：

```text
/api/calendar.ics?s={selection_token}
/api/calendar.mobileconfig?s={selection_token}
```

## iPhone 日历订阅

1. 打开首页，点击底部“查看赶集日历”。
2. 日历默认包含全部可订阅集市；如有不需要的集市，可在顶部标签里删除。
3. Safari 中点“订阅到 Apple 日历”，页面会打开 `webcal://` 订阅链接。
4. 按系统提示订阅日历。
5. 添加后可在 iPhone 日历列表中单独关闭显示或删除。

小红书、微信等内置浏览器可能无法安装订阅配置。这时点击“复制订阅链接”，再到 iPhone 日历里手动添加订阅日历。

如果看到 “Events” 事件列表，请取消；那是导入一次性事件，不是订阅日历。

## 新增集市

1. 在 `data/markets.json` 追加对象。
2. 填写稳定的 `id`，后续不要随意修改；它会进入事件 UID 和订阅 token。
3. 填写 `schedule`，它是程序计算营业日期和订阅能力的唯一日期规则。
4. 补充 `summary`、攻略字段、地点、`amap_lat` / `amap_lng` 高德坐标和图片。
5. 运行 `npm run build` 和 `npm test`。

支持的日期规则：

```json
{ "schedule": { "type": "daily" } }
```

```json
{ "schedule": { "type": "lunar_days", "days": [2, 9, 16, 23] } }
```

```json
{ "schedule": { "type": "weekdays", "days": [0, 5, 6] } }
```

```json
{ "schedule": { "type": "month_days", "days": [5, 10, 15, 20, 25, 30] } }
```

```json
{ "schedule": { "type": "interval_days", "start_date": "2026-01-05", "interval": 6 } }
```

`weekdays` 使用 JavaScript / 前端常见编号：周日是 `0`，周一是 `1`，周六是 `6`。

`interval_days` 用于双廊街这类固定间隔循环：`start_date` 是一个已知赶集日，`interval` 是间隔天数。

## 禁用订阅或每天开

不确定日期或暂时不想进入 Apple 日历时，不要删除集市。优先这样处理：

```json
{
  "subscription_enabled": false
}
```

这样攻略页仍可保留信息，订阅接口不会为它生成事件。

每天开放、不需要订阅日历的市场使用：

```json
{
  "schedule": { "type": "daily" }
}
```

## 更新赶集规则

token 只记录选择了哪些 `market id`，不记录具体事件或攻略快照。只要 `id` 保持稳定，更新赶集规则后，订阅链接会在下一次日历刷新时自动拿到新事件。

维护规则：

1. 不要随意修改已有 `id`。
2. 新增、重排集市不会影响已订阅链接。
3. 如果必须下线某个集市的订阅，设置 `subscription_enabled: false`。
