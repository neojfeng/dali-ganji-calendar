# 大理赶集日历

一个轻量的 Apple 日历订阅项目：用 `data/markets.json` 维护赶集数据，用 Python 生成公开的 `public/dali-ganji.ics`，再通过 GitHub Pages 发布订阅落地页。

## 订阅地址

GitHub Pages 发布成功后，可以使用：

- 落地页：<https://neojfeng.github.io/dali-ganji-calendar/>
- Apple 日历一键订阅：`webcal://neojfeng.github.io/dali-ganji-calendar/dali-ganji.ics`
- HTTPS 订阅链接：<https://neojfeng.github.io/dali-ganji-calendar/dali-ganji.ics>

## 本地生成

```bash
python3 -m pip install -r requirements.txt
python3 scripts/generate_ics.py
```

生成结果会写入：

```text
public/dali-ganji.ics
```

脚本默认从当天开始，生成未来 18 个月的全天事件。调试时可以指定开始日期：

```bash
python3 scripts/generate_ics.py --start-date 2026-06-23
```

## 当前收录与核验说明

当前样例数据收录 6 个点位：

- 三月街赶集：农历初二、初九、十六、二十三。
- 床单厂集市：每周六、周日，以当周活动为准。
- 北门菜市场集市：每天开市，作为日常菜市场收录。
- 银桥街集市：农历初五、十三、二十、二十八。
- 湾桥镇集市：农历初四、十一、十八、二十六；旧公开表常见二十五，较新的本地信息提示为二十六，继续实地复核。
- 凤仪街集市：每月公历逢五、逢十。

赶集时间来自公开资料交叉核对，并保留实地验证入口。后续如果有当地人反馈，应优先更新 `data/markets.json` 的规则和 `source_note`。

## 数据结构

赶集数据在 `data/markets.json`，每个集市是一条对象：

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
  "schedule_text": "农历初二、初九、十六、二十三赶集",
  "apple_maps_url": "",
  "amap_url": "",
  "source_note": "数据来自公开资料 + 实地验证中，如有误差欢迎反馈。"
}
```

## 新增集市

1. 在 `data/markets.json` 里追加一个对象。
2. `id` 使用稳定的小写英文或拼音；同一天事件的 UID 会使用 `{id}-{date}@dali-ganji-calendar`，后续不要随意改。
3. `name` 写日历标题，例如 `三月街赶集`。
4. `location_name` 写地点短名，`address` 写更具体的位置说明。
5. `intro` 控制日历 DESCRIPTION 第一行，尽量短，适合手机日历快速查看。
6. `source_note` 写数据说明，建议保留“数据来自公开资料 + 实地验证中，如有误差欢迎反馈。”

## 赶集规则

支持三种 `schedule_type`。

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
  "weekdays": [5],
  "schedule_text": "每周六赶集"
}
```

`weekdays` 使用 Python 的星期编号：周一是 `0`，周日是 `6`。

每月公历固定日期：

```json
{
  "schedule_type": "gregorian_month_days",
  "month_days": [5, 10, 15, 20, 25, 30],
  "schedule_text": "每月公历逢五、逢十赶集"
}
```

这个规则适合“每月逢五逢十”这类按公历日期计算的集市。

## 补充坐标和地图链接

`lat` 和 `lng` 可以先填 `null`，脚本会跳过 `GEO` 字段，不会报错。

有坐标时：

```json
{
  "lat": 25.6941,
  "lng": 100.1614
}
```

脚本会写入 ICS 的 `GEO` 字段。如果没有 `apple_maps_url`，但有坐标，脚本会自动生成 Apple Maps 链接。

也可以手动补充地图链接：

```json
{
  "apple_maps_url": "https://maps.apple.com/?ll=25.6941,100.1614&q=三月街赶集",
  "amap_url": "https://uri.amap.com/marker?position=100.1614,25.6941&name=三月街赶集"
}
```

有 `apple_maps_url` 时优先使用手动链接；有 `amap_url` 时会在 DESCRIPTION 中展示高德地图导航。

## 订阅页面

落地页在 `public/index.html`。部署到 GitHub Pages 后，页面会根据当前域名自动生成：

- `webcal://.../dali-ganji.ics`：一键订阅 Apple 日历
- `https://.../dali-ganji.ics`：手动复制订阅链接

## GitHub Pages 部署

本仓库包含 `.github/workflows/deploy-pages.yml`。

1. 在 GitHub 仓库设置中打开 `Settings -> Pages`。
2. `Build and deployment` 的 `Source` 选择 `GitHub Actions`。
3. push 到 `main` 后，workflow 会安装依赖、运行 `python scripts/generate_ics.py`，然后把 `public/` 发布到 GitHub Pages。

发布完成后，访问 Pages 地址即可看到订阅落地页。
