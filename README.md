# 大理赶集日历

一个轻量的 Apple 日历订阅项目。用户在落地页选择自己关心的集市，系统生成只包含这些集市的订阅链接。

## 为什么使用纯静态组合日历

大理赶集地点多，距离也远。全量订阅会把很多无关事件放进用户日历里，所以页面允许用户选择自己关心的集市。

当前只收录 6 个集市，所有非空组合最多 63 种，适合提前生成静态 ICS 文件：

1. `data/markets.json` 维护集市配置。
2. `scripts/generate_events.py` 预生成未来 18 个月所有事件到 `public/events.json`。
3. `scripts/generate_static_calendars.py` 预生成所有选择组合到 `public/calendars/`。
4. 落地页按用户选择生成对应静态 ICS 链接。

示例：

```text
webcal://neojfeng.github.io/dali-ganji-calendar/calendars/sanyuejie__yinqiaojie.ics
https://neojfeng.github.io/dali-ganji-calendar/calendars/sanyuejie__yinqiaojie.ics
```

这样不依赖 Vercel 动态接口，微信和小红书分享时更稳定。

## 本地运行

```bash
python3 -m pip install -r requirements.txt
python3 scripts/generate_events.py
python3 scripts/generate_ics.py
python3 scripts/generate_static_calendars.py
python3 -m http.server 8000 --directory public
```

打开：

```text
http://localhost:8000
```

测试静态组合 ICS：

```text
http://localhost:8000/calendars/sanyuejie__yinqiaojie.ics
```

## 部署到 GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`。push 到 `main` 后，GitHub Actions 会：

1. 安装 Python 依赖。
2. 生成 `public/events.json`。
3. 生成全量 `public/dali-ganji.ics`。
4. 生成 `public/calendars/` 下的 63 个组合 ICS。
5. 发布 `public/` 到 GitHub Pages。

发布地址：

```text
https://neojfeng.github.io/dali-ganji-calendar/
```

如果是第一次配置 Pages，在 GitHub 仓库里打开 `Settings -> Pages`，`Build and deployment` 的 `Source` 选择 `GitHub Actions`。

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
  "lat": 25.6957,
  "lng": 100.1518,
  "image": "/images/markets/sanyuejie.jpg",
  "image_alt": "三月街赶集的摊位和苍山轮廓插画",
  "image_credit": "本地生成插画",
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
3. 填好 `lat`、`lng`，页面会用它们在前端本地计算距离。
4. 选择合适的 `schedule_type` 并填写对应规则。
5. 运行 `python3 scripts/generate_events.py` 和 `python3 scripts/generate_static_calendars.py`。
6. 本地打开页面，确认新集市出现在列表里。

修改介绍、地点、坐标或地图链接：

- 改 `intro` 会影响页面卡片和日历 DESCRIPTION。
- 改 `location_name` 或 `address` 会影响日历 LOCATION 和地点说明。
- 填 `lat`、`lng` 后，ICS 会包含 `GEO`，落地页也能显示“距你 x km”。
- 填 `apple_maps_url` 后，DESCRIPTION 会展示 Apple 地图导航。
- 填 `amap_url` 后，DESCRIPTION 会展示高德地图导航。

如果没有地图链接但有坐标，脚本会自动生成 Apple Maps 链接。

## 添加或替换集市图片

图片放在：

```text
public/images/markets/
```

建议命名：

```text
public/images/markets/{market_id}.jpg
```

然后在 `data/markets.json` 里填写：

```json
{
  "image": "/images/markets/sanyuejie.jpg",
  "image_alt": "三月街赶集的摊位和苍山轮廓插画",
  "image_credit": "本地生成插画"
}
```

图片建议使用 16:10 或 4:3，宽度 1200px 左右即可。不要热链外部网站图片；如果某个集市没有图片，页面会自动显示 `public/images/markets/placeholder.jpg`。

## 定位和距离

落地页不会自动请求定位。用户点击“使用我的位置推荐附近集市”后，浏览器才会请求位置权限。

用户位置只在前端本地用于 Haversine 直线距离计算，不会上传到服务器，也不会写入 `localStorage`。如果定位失败，页面会提示用户继续手动选择。

## Apple 日历测试

1. 在落地页勾选一个或多个集市。
2. 点击“一键订阅 Apple 日历”。
3. 如果在小红书或微信里打不开，点击“复制订阅链接”。
4. 到 iPhone 日历里手动添加订阅日历，粘贴 HTTPS 链接。
5. 添加后检查日历事件是否只包含已选集市。

订阅链接里的 `market_id` 会按 `markets.json` 顺序生成，同一组选项会得到稳定 URL。
