# 修复生产环境表情图片无法显示 Implementation Plan

## Repository Research

### 问题分析

表情图片在生产部署后无法加载，原因是 **Go 后端缺少 `/stickers/*` 路由的静态文件服务注册**。

当前架构：
1. 前端 emoji 数据中的 URL 为 `/stickers/{platform}/{file}.avif`（在 [emojiData.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/data/stickers/emojiData.ts) 中通过 `toLocalUrl()` 生成）
2. Vite 构建时将 `frontend/public/stickers/` 原样复制到 `embed_static/static/spa/stickers/`
3. Go 的 `//go:embed static/*` 会将 `embed_static/static/` 下所有文件（包括 stickers）打包进二进制
4. 但 [embed.go](file:///c:/Users/freefire/Documents/jiang13-forum/embed_static/embed.go) 的 `SetupEmbed()` **只注册了 `/assets/*filepath` 路由**（用于 JS/CSS chunk），没有注册 `/stickers/*filepath`
5. 同时 `IsSPARoute()` 函数也没有排除 `/stickers` 前缀，导致请求被 SPA NoRoute fallback 处理，返回 index.html 而非图片

开发模式之所以正常，是因为 Vite dev server 自动托管了 `public/stickers/` 下的静态文件。

### 当前代码状态

- `embed.go` 第 13 行: `//go:embed static/*` — 正确嵌入了所有静态资源（含 stickers）
- `embed.go` 第 33-43 行: `SetupEmbed()` — 只处理了 `static/spa/assets`，缺少 stickers 路由
- `embed.go` 第 63-77 行: `IsSPARoute()` — 缺少 `/stickers` 前缀排除

## Files and Modules

- `embed_static/embed.go`: 新增 `/stickers/*filepath` 文件服务路由；在 `IsSPARoute` 中排除 `/stickers` 前缀

## Implementation Steps

1. **在 `SetupEmbed` 中注册 `/stickers` 路由**
   - 参照现有 `/assets` 路由的模式，添加对 `static/spa/stickers` 子目录的文件服务
   - 使用 `fs.Sub(staticFS, "static/spa/stickers")` 获取 stickers 子文件系统
   - 注册 `GET /stickers/*filepath` 路由，直接透传，不设置长期缓存（表情可能更新）

2. **在 `IsSPARoute` 中排除 `/stickers` 前缀**
   - 在现有 `strings.HasPrefix(path, "/assets")` 附近添加 `strings.HasPrefix(path, "/stickers")`
   - 确保表情请求不会被 SPA fallback 拦截

## Dependencies and Considerations

- stickers 目录下存储的是 `.avif` 图片文件，不需要设置特殊 MIME type（http.FileServer 会根据扩展名自动识别）
- stickers 资源不含哈希指纹，不应设置 `immutable` 缓存头（与 `/assets` 不同），但可以设置短过期缓存
- 需确保 `fs.Sub` 路径与实际构建输出路径一致：`embed_static/static/spa/stickers/`

## Validation

- 重新构建前端：`cd frontend && npm run build`
- 重新构建 Go 二进制：`go build -o jiang13-linux-amd64`
- 部署后访问 `/stickers/tieba/tb_01.avif` 应能直接返回图片内容（HTTP 200）
- 在评论框中打开表情选择器，所有平台的表情应正常显示

## Risks

- **风险**: 如果未来在 `public/` 下新增其他静态资源目录（如 `avatars/`、`flags/` 等），需要同样在 `embed.go` 中注册对应路由
- **应对**: 可考虑后续重构为自动扫描 `public/` 下所有子目录并自动注册路由，或改为统一的 SPA 静态文件服务方案
