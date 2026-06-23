# 大理赶集日历

一个轻量的 Apple 日历订阅项目。用户在落地页选择自己关心的集市，系统生成只包含这些集市的订阅链接。

## 为什么需要动态接口

大理赶集地点多，距离也远。全量订阅会把很多无关事件放进用户日历里，所以现在改为：

1. `data/markets.json` 维护集市配置。
2. `scripts/generate_events.py` 预生成未来 18 个月所有事件到 `public/events.json`。
3. `api/calendar.ics` 根据用户选择的 `markets` 参数过滤事件并返回 ICS。

示例：

```text
webcal://your-domain.vercel.app/api/calendar.ics?markets=sanyuejie,yinqiaojie
https://your-domain.vercel.app/api/calendar.ics?markets=sanyuejie,yinqiaojie
```

如果没有有效的 `market_id`，接口会返回一个空日历，而不是错误页面。这样更适合 Apple 日历订阅。

## 本地运行

```bash
python3 -m pip install -r requirements.txt
python3 scripts/generate_events.py
python3 scripts/generate_ics.py
npx vercel dev
```

打开 Vercel Dev 给出的本地地址，通常是：

```text
http://localhost:3000
```

测试动态接口：

```text
http://localhost:3000/api/calendar.ics?markets=sanyuejie,yinqiaojie
```

## 部署到 Vercel

1. 打开 Vercel，选择 Import Git Repository。
2. 选择 `neojfeng/dali-ganji-calendar`。
3. 保持默认项目设置即可，仓库里的 `vercel.json` 已写好构建命令。
4. 部署完成后，用 Vercel 分配的域名访问落地页。

`vercel.json` 会在部署时运行：

```bash
python3 scripts/generate_events.py
python3 scripts/generate_ics.py
```

GitHub Pages 不能运行动态 API，所以定制订阅版本应部署在 Vercel。

## 当前收录

- 三月街赶集：农历初二、初九、十六、二十三。
- 床单厂集市：每周六、周日，以当周活动为准。
- 北门菜市场集市：每天开市，作为日常菜市场收录。
- 银桥街集市：农历初五、十三、二十、二十八。
- 湾桥镇集市：农历初四、十一、十八、二十六；旧公开表常见二十五，继续实地复核。
- 凤仪街集市：每月公历逢五、逢十。

## 数据结构

集市数据在 `data/markets.json`。每个对象建议包含：

```json
{
  "id": "sanyuejie",
  "name": "三月街赶集",
  "location_name": "三月街",
  "address": "大理古城苍山门对面",
  "lat": null,
  "lng": null,
  "intro": "三月街是大理古城附近最有名的传统集市之一，适合逛本地小吃、蔬菜水果、手作和日用品。",
  "schedule_type": "lunar_days",
  "lunar_days": [2, 9, 16, 23],
  "weekday": [],
  "schedule_text": "农历初二、初九、十六、二十三赶集",
  "apple_maps_url": "",
  "amap_url": "",
  "source_note": "数据来自公开资料 + 实地验证中，如有误差欢迎反馈。"
}
```

`id` 会进入订阅 URL 和事件 UID，后续不要随意修改。

## 赶集规则

农历固定日期：

```json
{
  "schedule_type": "lunar_days",
  "lunar_days": [2, 9, 16, 23],
  "weekday": [],
  "schedule_text": "农历初二、初九、十六、二十三赶集"
}
```

每周固定星期：

```json
{
  "schedule_type": "weekly",
  "lunar_days": [],
  "weekday": [5, 6],
  "schedule_text": "每周六、周日市集"
}
```

`weekday` 使用 Python 的星期编号：周一是 `0`，周日是 `6`。

每月公历固定日期：

```json
{
  "schedule_type": "gregorian_month_days",
  "lunar_days": [],
  "weekday": [],
  "month_days": [5, 10, 15, 20, 25, 30],
  "schedule_text": "每月公历逢五、逢十赶集"
}
```

## 新增或修改集市

新增集市：

1. 在 `data/markets.json` 追加一个对象。
2. 填好 `id`、`name`、`location_name`、`address`、`intro`。
3. 选择合适的 `schedule_type` 并填写对应规则。
4. 运行 `python3 scripts/generate_events.py`。
5. 本地打开页面，确认新集市出现在列表里。

修改介绍、地点、坐标或地图链接：

- 改 `intro` 会影响页面卡片和日历 DESCRIPTION。
- 改 `location_name` 或 `address` 会影响日历 LOCATION 和地点说明。
- 填 `lat`、`lng` 后，ICS 会包含 `GEO`。
- 填 `apple_maps_url` 后，DESCRIPTION 会展示 Apple 地图导航。
- 填 `amap_url` 后，DESCRIPTION 会展示高德地图导航。

如果没有地图链接但有坐标，脚本会自动生成 Apple Maps 链接。

## Apple 日历测试

1. 在落地页勾选一个或多个集市。
2. 点击“一键订阅 Apple 日历”。
3. 如果在小红书或微信里打不开，点击“复制订阅链接”。
4. 到 iPhone 日历里手动添加订阅日历，粘贴 HTTPS 链接。
5. 添加后检查日历事件是否只包含已选集市。

订阅链接里的 `market_id` 会按 `markets.json` 顺序生成，同一组选项会得到稳定 URL。
