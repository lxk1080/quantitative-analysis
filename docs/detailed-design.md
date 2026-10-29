# 详细设计

## 1. 前端模块

### 1.1 页面编排

`src/app/page.tsx` 只管理首页状态和流程：

- 读取状态与可用策略；
- 创建同步/筛选任务并轮询进度；
- 管理当前应用条件、编辑草稿、选择器和编辑弹窗状态；
- 调用模块化组件展示页面。

页面不保存 K 线绘图和自定义条件表单细节，这些实现位于 `src/app/components/`。

### 1.2 组件职责

| 文件                               | 职责                                          |
| ---------------------------------- | --------------------------------------------- |
| `components/custom-editor.tsx`     | 自定义条件草稿、收藏命名、确认与 Toast        |
| `components/rule-selector.tsx`     | 预设和收藏选择、编辑入口、删除确认            |
| `components/screening-results.tsx` | 结果表、同花顺跳转、可拖动日线窗口和 SVG K 线 |
| `components/status-widgets.tsx`    | 数据指标卡、任务进度条                        |
| `components/dialogs.tsx`           | 通用命名、确认和状态提示弹窗                  |
| `lib/custom-conditions.ts`         | 默认条件、条件定义编译和说明摘要              |
| `lib/types.ts`                     | 页面/API DTO 类型                             |

### 1.3 条件编辑交互

条件选择器与编辑器是两层弹窗：

1. 选择器中的“编辑”仅复制收藏配置到草稿并打开编辑器，不改变 `selected`。
2. 编辑器保存后更新收藏文件并关闭，选择器仍在底层，因此用户回到筛选条件列表。
3. 只有在选择器中点击条件主区域时，才应用该条件。
4. 若被编辑的收藏正是当前已选条件，保存后仅同步该已选条件的最新配置和摘要。

## 2. 自定义条件定义

前端与收藏服务都将 UI 配置编译为受控 JSON：

```json
{
  "version": 1,
  "operator": "all",
  "conditions": [
    { "type": "exclude_st" },
    { "type": "limit_up_days_ago", "days_ago": 3 },
    { "type": "volume_ratio_days_ago", "days_ago": 0, "minimum": 3 }
  ]
}
```

`operator` 当前固定为 `all`，即所有启用条件必须同时满足。页面不接受用户输入 JavaScript、SQL 或任意表达式。

### 2.1 量比

`volume_ratio_days_ago` 参数：

- `days_ago`：0 表示当日，正整数表示此前交易日；
- `minimum`：量比下限，默认 3。

盘中当日量比：

```text
当前累计成交量 / 已过交易分钟数
-------------------------------- = 量比
此前 5 个交易日平均每分钟成交量
```

盘后或历史日量比：

```text
目标交易日成交量
---------------- = 量比
此前 5 个交易日平均成交量
```

### 2.2 涨停

涨停判断使用原始价格：

```text
涨停价 = round_to_cent(昨收 × (1 + 涨停比例))
是否涨停 = 原始收盘价（按分） >= 涨停价（按分）
```

比例由股票代码所属板块确定：主板 10%，创业板/科创板 20%，北交所 30%。以“分”进行整数比较，避免二进制浮点误差。

## 3. 本地 K 线

### 3.1 数据接口

`GET /api/stocks/:code?days=N` 返回最多 90 条有效日线及相关指标。数据按日期倒序读取，前端反转后按时间正序绘制。

返回数据包括：

- 前复权 OHLC、成交量；
- MA5、MA10、MA60、DKX；
- 原始收盘价、昨收价，用于涨停配色。

### 3.2 SVG 绘制

图表使用固定逻辑画布 `740 × 520` 与 `preserveAspectRatio="xMidYMid meet"`。绘制区域分为：

- 顶部图例；
- K 线与均线主图区；
- 底部成交量区。

配色：

| 情况     | K 线实体     | 影线 | 成交量 |
| -------- | ------------ | ---- | ------ |
| 普通上涨 | 白底红色空心 | 红色 | 红色   |
| 涨停     | 白底紫色空心 | 紫色 | 紫色   |
| 下跌     | 绿色实心     | 绿色 | 绿色   |

MA5 为橙色、MA10 为紫色、MA60 为蓝色、DKX 为黑色实线。每条均线从第一个非空指标值开始，以 SVG `M` 起笔，避免 MA60 因前导空值缺失。

### 3.3 缩放与拖动

组件保存 `{ start, count }` 作为横轴视口：

- 原始数据最多 90 根；
- 滚轮向上将 `count` 乘以 0.8，向下乘以 1.25，范围最少 15 根、最多全部数据；
- 缩放后视口右端锚定最新 K 线；
- SVG 使用非 passive 原生 `wheel` 监听并调用 `preventDefault`，避免滚轮带动主页；
- 指针按下后使用 pointer capture，将水平位移换算为交易日位移；
- SVG 设置 `user-select: none`，避免拖动时选中图例文字。

## 4. 任务与 API

筛选结果有 `matched`、`not_matched`、`unavailable` 三种状态。`unavailable` 的直接原因是本次筛选缺少有效的盘中报价/前复权价格，或缺少规则所需的历史日线和指标。可能的外部成因包括停牌、行情源漏报或异常。Worker 在 `screening_results.detail_json` 中记录原因或条件消息，结果页当前只展示命中股票及不可用总数，EBK 也只导出命中股票。

### 4.1 API

| 方法         | 路径                             | 说明                   |
| ------------ | -------------------------------- | ---------------------- |
| `GET`        | `/api/status`                    | 数据状态与概览         |
| `POST`       | `/api/jobs/daily-sync`           | 创建或复用日线同步任务 |
| `POST`       | `/api/jobs/realtime-sync`        | 创建实时行情同步任务   |
| `GET`        | `/api/jobs/:id`                  | 读取任务状态和进度     |
| `GET`        | `/api/screening-rules`           | 读取预设和收藏策略     |
| `POST`       | `/api/screening-runs`            | 创建筛选任务           |
| `GET`        | `/api/screening-runs/:id`        | 获取筛选结果           |
| `GET`        | `/api/screening-runs/:id/export` | 导出 EBK               |
| `GET/POST`   | `/api/custom-rules`              | 创建、列出收藏条件     |
| `PUT/DELETE` | `/api/custom-rules/:id`          | 更新、删除收藏条件     |
| `GET`        | `/api/stocks`                    | 股票搜索与分页         |
| `GET`        | `/api/stocks/:code`              | 个股日线和指标         |

### 4.2 按需 Worker

`daily-sync` 和 `screening-runs` 的 API 在写入任务后调用 `launchWorkerOnce()`。该函数启动：

```text
python -m quant_worker.cli worker
```

不带 `--loop` 的 Worker 仅处理一个待执行任务后退出。`npm run worker` 则启动带 `--loop` 的常驻模式。页面使用 800ms 轮询获取任务进度。

## 5. 数据一致性

- 正式日线、原始日线与指标均由 Python Worker 写入。
- 日线保留数为 `RETAINED_TRADING_DAYS = 90`。
- 前端只读 SQLite，不在浏览器中更新市场数据。
- 实时快照不写入正式日线；盘中筛选上下文将实时价格与历史数据组合。
- 收藏 JSON 由 Next.js 服务端文件模块读写，文件名必须符合安全 ID 格式。

## 6. 启动与验证

```powershell
npm.cmd install
python -m pip install -r requirements.txt
npm.cmd run db:migrate
npm.cmd run dev
```

验证命令：

```powershell
python -m unittest discover -s quant_worker/tests -v
npm.cmd run test:web
npm.cmd run build
```

`npm run dev` 只启动 Next.js 开发服务；任务执行由 API 按需拉起 Worker。需要持续处理队列时，额外运行 `npm run worker`。
