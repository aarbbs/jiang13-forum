# Admin 媒体库（SSR）— 实现计划

> 状态：已完成（SSR `/admin/media`）  
> 分支：`rebuild/gitea-ssr`

## 范围

| 能力 | 服务 | 路由 |
|------|------|------|
| 分类/搜索/分页列表 | `UploadStore.ListMedia` | `GET /admin/media` |
| 单删 | `DeleteMediaByIDs` | `POST /admin/media/:id/delete` |
| 批量删 | 同上 | `POST /admin/media/delete` |
| 同步索引 | `SyncMediaIndex` | `POST /admin/media/sync` |

## 不做

S3 热切换 Admin、全站未引用扫描清理、WebP 产品化默认策略。

## 验证

`build.bat`；冒烟：写入 uploads → 同步索引 → 列表可见 → 删除。
