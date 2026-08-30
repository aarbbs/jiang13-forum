# Docker 数据持久化说明

Docker 部署时**默认只挂载一个目录**，不是分别映射「数据库文件夹」和「附件文件夹」两个卷。

## 挂载对应关系

| 宿主机 | 容器内 |
|--------|--------|
| 任意目录或 named volume（如 `jiang13-data`） | **`/data`** |

**示例：**

```bash
docker run -d --name jiang13 \
  -p 3000:3000 \
  -v /你的路径/jiang13-data:/data \
  --restart unless-stopped \
  hangzhang714128/jiang13-forum:latest
```

或在 `docker-compose.yml` 中：

```yaml
volumes:
  - jiang13-data:/data
  # 或绑定宿主机目录：
  # - ./data:/data
```

## `/data` 目录结构

数据库与附件都在同一个 `/data` 挂载内：

```
/data/
├── jiang13.db              # SQLite 主数据库（不含浏览量）
├── monitor.db              # 网站监控 page_views
├── uploads/                # 附件根目录
│   ├── avatars/            # 用户头像
│   └── posts/              # 帖子图片等
├── logs/
│   └── access/             # 网站监控请求日志（按日 jsonl）
│       └── YYYY-MM-DD.jsonl
├── IP2LOCATION-LITE-DB3.BIN       # 可选：IPv4 城市库（监控）
├── IP2LOCATION-LITE-DB3.IPV6.BIN  # 可选：IPv6 城市库
├── GeoLite2-ASN.mmdb              # 可选：ASN/运营商
├── GeoLite2-Country.mmdb          # 可选：国家兜底
├── .jwt_secret             # JWT 密钥（自动生成）
├── filter_words.txt        # 敏感词配置
└── jiang13.log             # 运行日志（若启用）
```

| 用途 | 路径 |
|------|------|
| 主数据库 | `/data/jiang13.db` |
| 监控浏览量 | `/data/monitor.db` |
| 附件 | `/data/uploads/` |
| 请求日志（监控） | `/data/logs/access/` |
| 地理库（可选） | `/data/IP2LOCATION-LITE-DB3*.BIN`、`GeoLite2-ASN.mmdb` 等 |

官方镜像不要求拆成两个 volume；挂好 `/data` 即可同时持久化 SQLite、上传文件与监控日志。

地理库与 BIN **不内置**于 Docker 镜像。详见 [网站监控设计](monitor.md)。管理端展示完整客户端 IP（不做脱敏）。

## 设计说明：为何只挂一个 `/data`

对本项目（单容器、SQLite、默认可本地存附件）而言，**一个数据卷是合理默认**：

- 部署成本最低，不易漏挂导致「重启丢图 / 丢库」
- 备份、迁移时拷贝或快照整个 `/data` 即可恢复站点状态
- 密钥（`.jwt_secret`）、敏感词与库同目录，避免「库还在、登录全失效」这类半残状态

若你习惯「数据库文件夹 / 附件文件夹」分开填写：在本镜像中它们分别是 **`/data` 下的文件与子目录**，不是两个独立容器路径。

附件特别大、希望对象存储时：优先使用管理后台的 **S3 兼容存储**，而不是拆 Docker 卷。

## 后续计划（可选增强，非必须）

按优先级，仅在有明确需求时做：

1. **文档与面板提示（优先）**
   - README / 1Panel 说明中固定话术：「只需挂载 `/data`；数据库=`jiang13.db`，监控=`monitor.db`，附件=`uploads/`」。
   - 本页保持为权威说明，避免用户误以为漏了一个卷。

2. **进阶：同一 DataDir 下拆挂子路径（文档级，无需改代码）**
   若必须把库与附件分到不同宿主机磁盘，可在仍使用容器 `/data` 的前提下分别绑定，例如：

   ```yaml
   volumes:
     # 推荐：父目录一次挂载
     - /ssd/jiang13:/data
     # 或仅把附件分到大容量盘（需保证 /data 下其余文件仍可写）
     - /ssd/jiang13:/data
     - /hdd/jiang13-uploads:/data/uploads
   ```

   拆挂时仍要保证 `/data` 下 `.jwt_secret` 等文件可写；不熟悉 Docker 时请继续只用单个 `/data` 挂载。

3. **产品级：可配置上传根目录（中期）**
   - 环境变量或 `app.ini` 支持 `upload_dir` 与 `data_dir` 分离。
   - Docker 示例改为可选双卷；**默认仍单卷**，避免破坏现有部署。

4. **不做的事**
   - 不为「看起来像 WordPress」而强制双卷。
   - 不在未支持分离配置前，在 UI 里假装有两个独立数据根。
