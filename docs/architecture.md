# 系统架构

## 1. 架构概览

项目以单机本地部署为目标。浏览器只与 Next.js 通信；Next.js 负责页面、HTTP API、任务创建和结果读取；Python Worker 负责耗时的数据与计算工作；两端通过同一个 SQLite 数据库和文件化收藏方案协作。

```text
浏览器
  │
  ▼
Next.js App Router
  ├─ 页面：主页、股票浏览、个股页
  ├─ 组件：条件编辑、条件选择、结果、本地 K 线、弹窗
  ├─ Route Handlers：状态、任务、筛选、股票、收藏
  └─ SQLite 读取 / 创建任务
          │
          ▼
Python Quant Worker
  ├─ 行情 Provider 与同步
  ├─ 前复权重建与指标计算
  ├─ 自定义条件与预设策略执行
  └─ 写入任务状态和筛选结果
          │
          ▼
SQLite + 收藏 JSON 文件
```

## 2. 技术边界

| 层       | 技术                           | 职责                               |
| -------- | ------------------------------ | ---------------------------------- |
| Web      | Next.js 15、React、TypeScript  | 页面渲染、交互、Route Handlers     |
| 数据访问 | better-sqlite3、Drizzle schema | SQLite 读取、迁移定义              |
| 计算     | Python 3.12 Quant Worker       | 同步、复权、指标、筛选任务         |
| 数据库   | SQLite                         | 证券、日线、指标、任务、筛选结果   |
| 图表     | 原生 SVG                       | 本地 K 线、均线、DKX、成交量及交互 |
| 外部跳转 | 同花顺个股页                   | 仅新标签页跳转，不嵌入 iframe      |

前端不得在浏览器内计算指标或执行全市场筛选；Python 不承担页面渲染。这样可避免规则公式在两端分叉。

## 3. 目录结构

```text
src/
  app/
    api/                         Route Handlers
    components/
      custom-editor.tsx          自定义条件编辑弹窗
      rule-selector.tsx          预设/收藏条件选择器
      screening-results.tsx      结果表、本地 K 线和窗口
      status-widgets.tsx         指标卡和任务进度
      dialogs.tsx                命名、确认、Toast 弹窗
    lib/
      types.ts                   前端 DTO 类型
      custom-conditions.ts       条件默认值、摘要与定义编译
    stocks/                      股票浏览与个股详情页
    page.tsx                     首页状态与流程编排
  db/                            SQLite client 与 Drizzle schema
  server/                        Worker 启动、收藏与预设服务
quant_worker/
  providers/                     Tushare、AKShare 等 Provider
  strategy_rules/                预设、自定义条件和收藏 JSON
  services.py                    同步、复权、指标相关服务
  worker.py                      任务领取与执行
drizzle/                         SQL migration
scripts/dev.mjs                  本地开发服务器启动脚本
```

## 4. 数据与任务流

### 4.1 同步

1. 页面调用 `POST /api/jobs/daily-sync`。
2. API 在 `sync_jobs` 中创建或复用日线同步任务。
3. API 按需启动一次 `python -m quant_worker.cli worker`。
4. Worker 刷新证券池、同步日线、重建前复权数据、计算指标，并保留最近 90 个交易日。
5. 页面轮询 `GET /api/jobs/:id` 显示进度。

### 4.2 筛选

1. 页面将预设 ID 或自定义 JSON 定义提交到 `POST /api/screening-runs`。
2. API 校验请求；收藏条件由服务端从 JSON 文件读取并编译。
3. Worker 执行条件，写入筛选运行记录和结果。
4. 页面读取 `GET /api/screening-runs/:id` 并显示命中项。

### 4.3 自定义收藏

收藏不是数据库表记录，而是 `quant_worker/strategy_rules/collections/custom-*.json` 文件。Next.js 服务端模块负责创建、更新、删除和读取；Worker 只接收编译后的条件定义。

## 5. 主要持久化对象

| 对象                                   | 用途                   |
| -------------------------------------- | ---------------------- |
| `securities`                           | 证券主数据和可筛选状态 |
| `daily_raw_bars`                       | 原始日线锚点数据       |
| `daily_bars`                           | 前复权日线             |
| `daily_indicators`                     | MA、DKX、MADKX10       |
| `realtime_quotes`                      | 最新实时快照           |
| `sync_jobs`                            | 同步与筛选的异步任务   |
| `screening_rules`                      | 内置规则元数据         |
| `screening_runs` / `screening_results` | 筛选运行与结果         |
| `sync_audit_logs`                      | 同步审计日志           |

## 6. Worker 运行模式

- **按需模式**：同步或筛选 API 会拉起一个单次 Worker，处理一个队列任务后退出；适合本地交互。
- **常驻模式**：`npm run worker` 对应 `python -m quant_worker.cli worker --loop`，持续轮询任务表；适合长时间运行。

两种模式共享同一 SQLite 数据库，部署时不应同时以多个无协调实例争抢同一任务队列。
