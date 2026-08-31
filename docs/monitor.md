# 网站监控设计说明

管理端「网站监控」：轻量自建访问统计，对标 1Panel 思路——**请求流水写文件、访客地理写独立库**，开启后不拖慢前台读帖。

## 双通道数据

| 数据 | 存储 | 用途 |
|------|------|------|
| 请求日志 | `{DataDir}/logs/access/YYYY-MM-DD.jsonl` | 请求日志页、请求数/流量/4xx·5xx、实时曲线 |
| page_views | `{DataDir}/monitor.db`（SQLite） | 浏览量/访客、国家/省/城市/运营商排行与地图 |

请求日志**只写 jsonl**，不进 SQLite。删除过期 `.jsonl` 即释放磁盘。

`page_views` **不进主库** `jiang13.db`。后台「导出备份」只含主库，不含浏览量。

### 文件行格式（JSONL）

每行一条 JSON，字段包括：`t`（RFC3339）、`method`、`path`、`status`、`bytes`、`duration_ms`、`ip`、`ua`、`referer`、`country`、`region`、`region_iso`、`city`、`asn`、`as_org`、`is_bot`。

### 保留天数

- `monitor_retention_days`：仅 **page_views**（默认 30）
- `monitor_access_log_retention_days`：请求日志文件（默认 7）

## 地理数据文件

放在数据目录（与 `jiang13.db` 同级），有则加载、无则静默降级：

| 文件 | 用途 |
|------|------|
| `IP2LOCATION-LITE-DB3.BIN` | IPv4 国家/省/城市 |
| `IP2LOCATION-LITE-DB3.IPV6.BIN` | IPv6 国家/省/城市 |
| `GeoLite2-ASN.mmdb` | ASN / 运营商 |
| `GeoLite2-Country.mmdb` | 可选：BIN 未命中时国家兜底 |

CDN 头（如 `CF-IPCountry`）仅在本地库无国家码时补全。不落 Lat/Lon/Zip/TimeZone。管理端展示**完整客户端 IP**。

写入时做本地中文映射（省 / 中国城市按 IP2Location 英文名 / 运营商）；同音城市（如苏州/宿州）按省份歧义。`country` 存 ISO2，展示用中文名。历史 `page_views` / 请求日志不会回写，仅影响新写入。

## 写入路径（性能）

1. 中间件：监控关闭或命中排除规则则直接放行；否则 `c.Next()` 后**仅入队**轻量字段（不查 BIN/ASN、不写盘）。
2. 后台 flush：出队 → Geo + 中文映射 → append 当日 jsonl + 更新内存实时环。
3. 队列上限 8192，满则丢弃新日志（保护内存与磁盘）。
4. pageview 信标 QPS 低，可在写入时同步 Geo 后写独立 `monitor.db`（不占用主库连接）。

**热路径零 Geo、零写库、零写文件。**

## 请求日志口径（排除规则）

默认只关心**前台访客**，排除管理员刷后台产生的壳请求：

- `/admin`、`/api/admin/`
- `/api/me`、`/api/site-branding`
- `/health`、`/uploads/`、`/media/`、静态后缀、`/api/monitor/pageview` 等

设置页可「恢复推荐排除规则」。不强制覆盖用户已保存的自定义列表。

浏览量/访客仍来自前台路由 pageview（后台路径本身不上报）。

## 实时与聚合

- 近 1 分钟 / 近 1 小时：内存环（flush 时更新），避免扫全文件。
- 今日请求数等：内存日累加器（进程内；重启后自新流量累积，论坛量级可接受）。
- 地理排行：仅 `page_views`。

## 诊断

```bash
go run ./cmd/monitor-geo-check -db data/monitor.db -ip 14.109.35.246
```

## 明确不做

- 不用 CIDR；不把请求日志写入 SQLite；不把 page_views 写入主库
- 不做街道级地图；Docker 镜像不内置 BIN/MMDB
