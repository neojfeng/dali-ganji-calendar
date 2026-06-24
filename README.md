# 大理赶集攻略 + Apple 日历订阅

这是一个移动端优先的“大理赶集攻略”小工具。用户先查看本周赶集、集市攻略、适合人群、买什么、怎么去和避坑提醒，再把自己常去的周期性集市加入 Apple 日历订阅。

项目继续使用纯静态 GitHub Pages 方案：提前生成公开数据和所有日历组合，页面在前端按用户选择拼出对应的 `webcal://` 或 HTTPS 订阅链接。

## 核心逻辑

1. `data/markets.json` 是唯一的集市和攻略数据源。
2. `scripts/generate_events.py` 读取数据，生成未来 18 个月的赶集事件到 `public/events.json`，并生成前端使用的 `public/markets.json`。
3. `scripts/generate_ics.py` 生成全量兼容文件 `public/dali-ganji.ics`。
4. `scripts/generate_static_calendars.py` 生成 `public/calendars/` 下所有非空选择组合。
5. `public/index.html` 展示攻略、详情页、定位距离和个性化订阅交互。

示例订阅链接：

```text
webcal://neojfeng.github.io/dali-ganji-calendar/calendars/sanyuejie__yinqiaojie.ics
https://neojfeng.github.io/dali-ganji-calendar/calendars/sanyuejie__yinqiaojie.ics
```

## 哪些地点会生成日历事件

只有同时满足以下条件的地点才会生成 ICS 事件，也才能在页面中“加入日历”：

- `market_type` 是 `periodic_fair`
- `calendar_enabled` 是 `true`

以下情况不会生成日历事件：

- `market_type` 是 `permanent_market` 的常设市场，例如北门菜市场。
- `calendar_enabled` 是 `false` 的地点。

静态组合文件仍会保留历史 market_id 组合；如果组合里包含常设市场或未启用日历的地点，它们不会产生事件。

## 本地运行

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/generate_events.py
.venv/bin/python scripts/generate_ics.py
.venv/bin/python scripts/generate_static_calendars.py
python3 -m http.server 8000 --directory public
```

打开：

```text
http://localhost:8000
```

测试详情页：

```text
http://localhost:8000/?market=sanyuejie
```

测试静态组合 ICS：

```text
http://localhost:8000/calendars/sanyuejie__yinqiaojie.ics
```

## 部署到 GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`。push 到 `main` 后，GitHub Actions 会自动：

1. 安装 Python 依赖。
2. 重新生成 `public/events.json` 和 `public/markets.json`。
3. 重新生成 `public/dali-ganji.ics`。
4. 重新生成 `public/calendars/` 下的组合 ICS。
5. 发布 `public/` 到 GitHub Pages。

发布地址：

```text
https://neojfeng.github.io/dali-ganji-calendar/
```

第一次配置 Pages 时，在 GitHub 仓库打开 `Settings -> Pages`，`Build and deployment` 的 `Source` 选择 `GitHub Actions`。

## 数据结构

周期性赶集点示例：

```json
{
  "id": "sanyuejie",
  "name": "三月街赶集",
  "area": "古城周边",
  "market_type": "periodic_fair",
  "calendar_enabled": true,
  "summary": "大理古城附近最有名的传统集市之一，适合第一次体验大理赶集。",
  "intro": "大理古城附近最有名的传统集市之一，适合逛本地小吃、蔬菜水果、手作和日用品。",
  "tags": ["游客友好", "小吃多", "水果", "手作"],
  "best_for": ["第一次体验", "小吃", "水果", "手作"],
  "not_for": ["怕人多", "只想安静买菜"],
  "schedule_type": "lunar_days",
  "lunar_days": [2, 9, 16, 23],
  "weekday": null,
  "schedule_text": "农历初二、初九、十六、二十三赶集",
  "best_time": "上午 8:30-11:30 品类更丰富，傍晚可能更便宜",
  "duration": "建议预留 1.5-2.5 小时",
  "location_name": "三月街",
  "address": "大理古城苍山门对面",
  "lat": 25.6957,
  "lng": 100.1518,
  "transport_tips": "打车可定位三月街，古城内步行前往也方便。",
  "parking_tips": "赶集日周边人流较多，建议优先打车、步行或骑行。",
  "route_tips": "建议从靠苍山一侧开始往古城方向逛，最后顺路到苍山门附近。",
  "what_to_buy": ["水果", "蔬菜", "菌子", "乳扇", "烧饵块"],
  "food_tips": ["烧饵块", "乳扇", "米线"],
  "photo_tips": "拍摊主、老人和特写前建议先询问。",
  "avoid_pitfalls": ["货比三家", "注意称重"],
  "nearby_places": ["大理古城", "苍山门"],
  "images": [
    {
      "src": "/images/markets/sanyuejie.jpg",
      "alt": "三月街赶集摊位"
    }
  ],
  "apple_maps_url": "",
  "amap_url": ""
}
```

常设市场示例：

```json
{
  "id": "beimen-caishichang",
  "name": "北门菜市场",
  "area": "古城周边",
  "market_type": "permanent_market",
  "calendar_enabled": false,
  "summary": "大理古城北门附近的日常菜市场，适合买菜、菌子、水果和本地食材。",
  "open_text": "每天开放",
  "tags": ["常设市场", "买菜", "水果", "菌子"],
  "location_name": "北门菜市场",
  "address": "大理古城北门附近",
  "lat": 25.7008,
  "lng": 100.1622,
  "images": []
}
```

`id` 会进入订阅 URL 和事件 UID，后续不要随意修改。

## 赶集规则

农历固定日期：

```json
{
  "schedule_type": "lunar_days",
  "lunar_days": [2, 9, 16, 23],
  "schedule_text": "农历初二、初九、十六、二十三赶集"
}
```

每周固定星期：

```json
{
  "schedule_type": "weekly",
  "weekday": [5, 6],
  "schedule_text": "每周六、周日市集"
}
```

`weekday` 使用 Python 的星期编号：周一是 `0`，周日是 `6`。

每月公历固定日期：

```json
{
  "schedule_type": "gregorian_month_days",
  "month_days": [5, 10, 15, 20, 25, 30],
  "schedule_text": "每月公历逢五、逢十赶集"
}
```

## 新增周期性赶集点

1. 在 `data/markets.json` 追加对象。
2. 填写 `id`、`name`、`area`、`market_type: "periodic_fair"`。
3. 只有确认日期可靠且需要生成订阅事件时，才设置 `calendar_enabled: true`。
4. 填写 `schedule_type` 和对应规则字段。
5. 补充 `summary`、`tags`、`best_for`、`what_to_buy`、交通和避坑字段。
6. 填写 `location_name`、`address`、`lat`、`lng`。
7. 运行生成脚本并本地测试。

## 新增常设市场

1. 设置 `market_type: "permanent_market"`。
2. 设置 `calendar_enabled: false`。
3. 填写 `open_text`，例如“每天开放”。
4. 补充攻略字段和地点坐标。
5. 常设市场会出现在集市列表中，但不会生成日历事件。

## 补充详情页攻略字段

详情页会读取这些字段：

- `summary`：一句话定位。
- `best_time`：建议到达时间。
- `duration`：建议停留时间。
- `best_for` / `not_for`：适合谁、不适合谁。
- `what_to_buy` / `food_tips`：买什么、吃什么。
- `route_tips` / `transport_tips` / `parking_tips`：怎么逛、怎么去、停车。
- `avoid_pitfalls` / `photo_tips`：避坑和拍照提醒。
- `nearby_places`：周边顺路。

字段缺失时页面会显示兜底文案，不会崩溃。

## 添加或替换图片

图片放在：

```text
public/images/markets/
```

建议命名：

```text
public/images/markets/{market_id}.jpg
```

然后在 `images` 里填写：

```json
{
  "images": [
    {
      "src": "/images/markets/sanyuejie.jpg",
      "alt": "三月街赶集摊位"
    }
  ]
}
```

图片建议使用 16:10 或 4:3，宽度 1200px 左右即可。不要热链外部网站图片；如果某个集市没有图片，页面会显示 `public/images/markets/placeholder.jpg`。

## 定位和距离

页面不会自动请求定位。用户点击“📍 使用当前位置”后，浏览器才会请求位置权限。

用户位置只在前端本地用于 Haversine 直线距离计算，不会上传到服务器，也不会写入 `localStorage`。如果定位失败，页面会提示用户继续按区域手动选择。

## Apple 日历测试

1. 打开首页，浏览本周赶集和集市攻略。
2. 点击“查看攻略”进入详情页，确认内容正常。
3. 在首页或详情页点击“加入日历”。
4. 选择一个或多个集市后，点击底部“生成日历”。
5. 点击“一键订阅 Apple 日历”。
6. 如果在小红书或微信里打不开，点击“复制订阅链接”。
7. 到 iPhone 日历中手动添加订阅日历，粘贴 HTTPS 链接。
8. 添加后检查日历事件是否只包含已加入的集市。

订阅链接里的 `market_id` 会按 `markets.json` 顺序生成，同一组选项会得到稳定 URL。
