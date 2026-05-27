<div align="center">

# proxvert

**代理配置格式 · 无损互转**

在 Mihomo YAML、sing-box JSON 与分享链接之间一键转换 · 纯前端 · 节点数据不离开浏览器

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Vite](https://img.shields.io/badge/build-Vite%205-646CFF.svg)](https://vitejs.dev/)
[![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-181717.svg)](.github/workflows/deploy.yml)

</div>

---

## ✨ 特性

- **三向互转** — Mihomo (Clash.Meta) YAML ⇄ sing-box JSON ⇄ 分享链接
- **多协议支持** — `vmess` · `vless` · `trojan` · `ss` · `ssr` · `hysteria` · `hysteria2` · `tuic` · `wireguard` · `socks` · `http`
- **自动识别格式** — 粘贴即转，无需手动选择输入格式
- **Base64 订阅解码** — 支持节点订阅链接的整段 base64 解析
- **纯前端运行** — 全部转换在浏览器中完成，无后端、无网络请求、无数据外发
- **会话级历史** — 最近转换仅保存在当前浏览器会话中，点击清空会一并移除
- **键盘友好** — `Ctrl/⌘ + Enter` 触发转换

## 🚀 在线使用

部署在 GitHub Pages，推送到 `main` / `master` 分支后自动构建发布（见 `.github/workflows/deploy.yml`）。

## 📦 快速开始

### 环境要求

- Node.js ≥ 18
- npm（或 pnpm / yarn）

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产版本（输出到 dist/）
npm run build

# 运行核心转换回归测试
npm test

# 本地预览构建产物
npm run preview
```

## 🔄 支持的转换矩阵

| 输入 ↓ \ 输出 → | 分享链接 | sing-box JSON | Mihomo YAML |
|---|:---:|:---:|:---:|
| 分享链接（含 base64 订阅） | ✓ | ✓ | ✓ |
| sing-box JSON | ✓ | ✓ | ✓ |
| Mihomo YAML | ✓ | ✓ | ✓ |

### 分享链接 alias 对照

| 规范化类型 | 接受的输入 scheme | 导出时使用的 scheme |
|---|---|---|
| `vmess` | `vmess://` | `vmess://` |
| `vless` | `vless://` | `vless://` |
| `trojan` | `trojan://` | `trojan://` |
| `shadowsocks` | `ss://` | `ss://` |
| `shadowsocksr` | `ssr://` | `ssr://` |
| `hysteria` | `hysteria://` · `hy1://` | `hysteria://` |
| `hysteria2` | `hysteria2://` · `hy2://` | `hysteria2://` |
| `tuic` | `tuic://` | `tuic://` |
| `wireguard` | `wg://` · `wireguard://` | `wg://` |
| `socks` | `socks://` · `socks4://` · `socks5://` | `socks4://` 或 `socks5://`（取决于 `version`） |
| `http` | `http://` · `https://` | `http://` 或 `https://`（取决于 `tls.enabled`） |

### 协议覆盖

| 协议 | 关键字段 |
|---|---|
| VMess | `uuid` · `alter_id` · `security` |
| VLESS | `uuid` · `flow`（含 Reality） |
| Trojan | `password` |
| Shadowsocks | `method` · `password`（SIP002 两种 base64 变体） |
| ShadowsocksR | `method` · `password` · `protocol` · `obfs` |
| Hysteria | `password/auth_str` · `obfs` · `up/down_mbps` |
| Hysteria2 | `password` · `obfs` · `up/down_mbps` |
| TUIC | `uuid` · `password` · `congestion_control` |
| WireGuard | `private_key` · `peer_public_key` · `address` |
| SOCKS | `username` · `password` · `version (4/5)` |
| HTTP/HTTPS | `username` · `password` · `tls` |

横向支持的传输层与安全层：`ws` · `grpc` · `http` · `httpupgrade` · `tls` · `reality` · `utls`。

说明：分享链接 scheme / alias 的单一来源（single source of truth）在 `src/core/share-link-schemes.js`；`hysteria://`（v1）导出时会将认证信息放在 userinfo（`hysteria://auth@host:port?...`）而不是 query string。

## 🏗️ 项目结构

```
proxvert/
├── index.html              # 单页入口
├── src/
│   ├── main.js             # UI 与分发：detect → parsers[src] → serializers[target]
│   ├── style.css
│   └── core/
│       ├── detect.js       # 输入格式自动识别
│       ├── share-link-schemes.js # 分享链接 scheme / alias 单一来源
│       ├── model.js        # NormalizedNode 规范化模型（中心枢纽）
│       ├── parsers/        # 三个解析器（→ NormalizedNode）
│       │   ├── links.js
│       │   ├── mihomo.js
│       │   └── singbox.js
│       └── serializers/    # 三个序列化器（NormalizedNode →）
│           ├── links.js
│           ├── mihomo.js
│           └── singbox.js
└── .github/workflows/deploy.yml
```

架构采用 **hub-and-spoke**：所有格式通过 `NormalizedNode` 单一规范化模型中转，新增格式只需各写一个 parser + serializer。详细架构分析见 [`COMPREHENSIVE-REPORT.md`](COMPREHENSIVE-REPORT.md)。

## 🛠️ 技术栈

- **构建工具** — [Vite 5](https://vitejs.dev/)
- **运行时依赖** — [js-yaml](https://github.com/nodeca/js-yaml)（仅用于 Mihomo YAML 编解码）
- **语言** — 原生 ES2020 模块，无框架

## 📄 License

[Apache License 2.0](LICENSE)
