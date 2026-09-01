# 量化选股工具详细设计

## 1. 项目目录与模块边界

建议采用单仓库结构。Next.js 代码使用 TypeScript，Python 代码负责量化处理；页面不直接访问外部行情或执行指标公式。

```text
quantitative-analysis/
├─ docs/
├─ drizzle/                           # Drizzle 配置与 SQL migrations
├─ src/
│  ├─ app/                            # Next.js 页面与 Route Handlers
│  │  ├─ dashboard/
│  │  ├─ data/
│  │  ├─ screener/
│  │  ├─ stocks/[code]/
│  │  └─ api/
│  ├─ components/                     # 表单、表格、图表、任务状态组件
│  ├─ db/
│  │  ├─ schema.ts                    # Drizzle 表与索引定义
│  │  ├─ client.ts                    # SQLite 连接与 WAL 配置
│  │  └─ repositories/
│  ├─ domain/                         # 规则 JSON schema、任务类型与展示 DTO
│  ├─ services/                       # 任务创建、结果读取和业务交互编排
│  └─ lib/                            # 日期、日志和结果类型
├─ quant_worker/
│  ├─ providers/                      # Provider 契约、标准化、校验
│  ├─ indicators/                     # 纯公式：MA、DKX
│  ├─ screening/                      # 规则编译和全市场执行
│  ├─ jobs/                           # 任务领取、进度与重试
│  ├─ services/                       # 同步、实时、指标、筛选、备份编排
│  └─ db/                             # SQLite 读写与事务边界
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
└─ scripts/                           # 本地维护与数据库校验脚本
```

Next.js 依赖方向必须保持为：`db/domain -> services/api -> app/components`；Python 依赖方向为 `providers/indicators/screening -> services -> jobs`。指标与筛选公式只存在于 Python，二者不得导入 Next.js 或 Drizzle。

## 2. 数据模型

### 2.1 `securities`：证券主数据

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | TEXT PK | 六位股票代码 |
| `exchange` | TEXT | `SH`、`SZ`、`BJ` |
| `name` | TEXT | 最近一次获取的证券简称 |
| `security_type` | TEXT | 仅 `A_SHARE` 可筛选 |
| `is_st` | INTEGER | 当前是否 ST/*ST |
| `is_active` | INTEGER | 是否处于可筛选状态 |
| `listed_at` | TEXT nullable | 上市日期 |
| `updated_at` | TEXT | 主数据刷新时间 |

筛选股票池条件固定为 `security_type = 'A_SHARE' AND is_st = 0 AND is_active = 1`。不得仅依靠代码前缀判断证券类型。

### 2.2 `daily_bars`：日线

| 字段 | 类型 | 说明 |
|---|---|---|
| `stock_code` | TEXT | 外键至 `securities` |
| `trade_date` | TEXT | `YYYY-MM-DD`，已完成交易日 |
| `open_qfq` / `high_qfq` / `low_qfq` / `close_qfq` | REAL | 前复权 OHLC |
| `volume` | INTEGER | 原始成交量 |
| `amount` | REAL nullable | 原始成交额 |
| `turnover_rate` | REAL nullable | 换手率 |
| `raw_close` | REAL nullable | 同日未复权收盘价，用于实时复权锚点 |
| `provider_name` | TEXT | 实际供应商 |
| `fetched_at` | TEXT | 获取时间 |
| `data_version` | INTEGER | 成功同步批次版本 |
| `quality_status` | TEXT | `valid`、`warning`、`invalid` |

主键为 `(stock_code, trade_date)`；另建索引 `(trade_date, stock_code)` 和 `(stock_code, trade_date DESC)`。`raw_close` 不参与历史技术指标，只用于实时价格转换及校验。

### 2.3 `daily_indicators`：指标

| 字段 | 类型 | 说明 |
|---|---|---|
| `stock_code`, `trade_date` | TEXT | 与日线一一对应 |
| `ma5`, `ma10`, `ma60` | REAL nullable | 前复权收盘价简单均线 |
| `dkx`, `madkx10` | REAL nullable | DKX 与 10 日信号线 |
| `indicator_version` | TEXT | 公式版本 |
| `source_data_version` | INTEGER | 依赖日线版本 |
| `calculated_at` | TEXT | 计算时间 |

指标样本不足时写 `NULL`，而不是 0。主键为 `(stock_code, trade_date)`。

### 2.4 `realtime_quotes`：实时快照

每只股票只保存最新一条快照。

| 字段 | 类型 | 说明 |
|---|---|---|
| `stock_code` | TEXT PK | 股票代码 |
| `quote_time` | TEXT | 供应商行情时间 |
| `raw_last_price` | REAL | 未复权实时价 |
| `qfq_last_price` | REAL nullable | 前复权等价实时价 |
| `volume` / `amount` | REAL nullable | 当前累计成交统计 |
| `qfq_factor` | REAL nullable | 转换因子 |
| `quality_status` | TEXT | `valid`、`stale`、`factor_unavailable` 等 |
| `provider_name` | TEXT | 来源 |
| `fetched_at` | TEXT | 本机获取时间 |

实时快照过期阈值由配置决定。盘中筛选只允许使用 `quality_status = 'valid'` 且未过期的记录。

### 2.5 任务、规则与结果

- `sync_jobs`：任务 ID、类型、状态、进度、开始/结束时间、错误摘要、统计计数。
- `sync_audit_logs`：每个 Provider 调用、请求摘要、响应哈希、校验异常和切换理由。
- `screening_rules`：规则名称、可版本化 JSON 定义、创建/修改时间。
- `screening_runs`：每次筛选的规则版本、运行模式、使用的行情时间、数据版本、命中数、状态。
- `screening_results`：命中股票、关键值、逐条条件结果和数据质量状态。
- `database_backups`：备份文件、创建时间、源数据版本、校验和和清理状态。

## 3. 数据同步模块

### 3.1 Provider 契约

Provider 位于 Python Worker 内，只能负责请求与标准化，不能直接写数据库或计算指标。

```python
@dataclass(frozen=True)
class DailyBarInput:
    stock_code: str
    trade_date: date
    open_qfq: float
    high_qfq: float
    low_qfq: float
    close_qfq: float
    volume: int
    provider_name: str
    fetched_at: datetime
    raw_close: float | None = None

class MarketDataProvider(Protocol):
    def list_securities(self) -> list[SecurityInput]: ...
    def fetch_daily_bars(self, request: DailyBarRequest) -> list[DailyBarInput]: ...
    def fetch_realtime_quotes(self, codes: list[str]) -> list[RealtimeQuoteInput]: ...
```

Provider 返回的每条日线必须标明是否前复权。当前实现对每只股票依次尝试腾讯、东方财富、新浪，并要求前复权 OHLC 与未复权收盘锚点来自同一个来源；无法确定复权状态或缺少未复权锚点的响应整体失败，不能被当作前复权数据入库。当前 AKShare 的同花顺接口没有同口径价格能力，且所谓“全部 A 股”接口是新股申购数据，因此不参与股票池或价格数据降级。

### 3.2 日线校验

写入前至少执行：

1. 股票存在于非 ST 普通 A 股池；
2. `trade_date` 是有效交易日且不晚于当前已确认日；
3. OHLC 均为有限正数，且 `low <= min(open, close) <= max(open, close) <= high`；
4. 成交量非负；
5. 同一请求无重复 `(stock_code, trade_date)`；
6. 同一日已有有效记录时，比对关键字段。超过配置容差时记录差异，进入 `warning`/待复核，不静默覆盖。

### 3.3 70 日滚动保留的事务顺序

以下顺序必须在单个写事务中完成：

```text
开始事务
  ├─ UPSERT 新/修订日线
  ├─ 查询每只股票最近 70 个交易日
  ├─ 重算受影响日期的指标
  ├─ 校验指标、日线和数据版本
  ├─ 删除该股票第 71 个交易日前的日线与指标
  ├─ 写入同步日志和版本
提交事务
```

若任一环节失败则回滚，不执行保留清理。为保证新入库的 70 天各自都有 MA60，首次补采在内存中使用约 140 日历史计算后，再写入最近 70 天日线和指标。

## 4. 指标引擎

### 4.1 输入与输出

输入为同一股票、按交易日升序排序、经过校验的前复权日线。输出与每个交易日对应，且显式说明样本不足。

### 4.2 移动平均线

对收盘价 `C`：

```text
MA(N, t) = (C[t] + C[t-1] + ... + C[t-N+1]) / N
```

当可用数据少于 `N` 条时输出 `null`。MA5、MA10、MA60 共用同一个滑动窗口实现，避免产生不同的边界行为。

### 4.3 DKX

采用可版本化的常用 DKX 定义：

```text
MID[t] = (3 × Close[t] + Open[t] + High[t] + Low[t]) / 6
DKX[t] = Σ(i = 0..19, (20 - i) × MID[t-i]) / 210
MADKX10[t] = MA(DKX, 10)[t]
```

DKX 需要至少 20 个交易日；MADKX10 需要至少 29 个交易日。公式版本写入 `indicator_version`，日后若更换定义，必须全量重算并保留重算日志。

### 4.4 参考实现

核心代码应保持纯 Python 函数，示意如下：

```python
def rolling_mean(values: list[float], window: int) -> list[float | None]:
    result: list[float | None] = []
    total = 0.0
    for index, value in enumerate(values):
        total += value
        if index >= window:
            total -= values[index - window]
        result.append(total / window if index >= window - 1 else None)
    return result

def calculate_dkx(bars: list[DailyBar]) -> list[float | None]:
    mid = [(3 * b.close_qfq + b.open_qfq + b.high_qfq + b.low_qfq) / 6 for b in bars]
    result: list[float | None] = []
    for index in range(len(mid)):
        if index < 19:
            result.append(None)
            continue
        weighted_sum = sum((20 - offset) * mid[index - offset] for offset in range(20))
        result.append(weighted_sum / 210)
    return result
```

生产代码需在输入阶段校验数值有限性，并用固定容差比较浮点数，不可用严格相等判断均线穿越。

## 5. 前复权实时价格模块

### 5.1 转换算法

实时 Provider 通常提供未复权现价。对于股票 `s`，获取最近已完成交易日 `d`：

```text
factor(s) = close_qfq(s, d) / raw_close(s, d)
realtime_qfq(s) = realtime_raw_last_price(s) × factor(s)
```

转换前必须检查 `raw_close > 0`、前复权收盘价存在、锚点日期与实时交易日关系合理、因子为有限正数。除权除息日或 Provider 可以直接给出调整因子时，应优先使用与当前交易日匹配的调整因子，并记录因子来源。

### 5.2 失败策略

实时价、复权锚点、证券状态任一不满足时：

- 写入实时快照与失败原因；
- 该股票不参与依赖实时价格的盘中条件；
- 筛选结果页面显示“数据不可用”，不显示为普通未命中；
- 不修改正式日线和历史指标。

## 6. 筛选规则模块

### 6.1 规则格式

首期规则使用受控 JSON，而不是执行用户输入的 JavaScript 或 SQL：

```json
{
  "version": 1,
  "operator": "all",
  "conditions": [
    { "type": "price_above_indicator", "indicator": "ma60" },
    { "type": "cross_above", "left": "ma5", "right": "ma10" },
    { "type": "volume_multiple", "window": 5, "minimum": 1.5 }
  ]
}
```

规则 schema 使用 Zod 在 API 边界校验。未知指标、非法窗口、空条件和不支持运算符必须拒绝。

### 6.2 筛选上下文

`ScreeningContext` 为每只股票提供：最近 70 日指标、最近两个已完成日、可选实时快照、运行模式与数据质量。盘后取最近完成日 `close_qfq`；盘中取 `realtime_quotes.qfq_last_price`。

穿越条件不能只比较当前值，必须同时检查前一交易日的相对关系。例如 MA5 上穿 MA10：

```text
MA5[t-1] <= MA10[t-1] 且 MA5[t] > MA10[t]
```

所有条件返回 `matched`、`not_matched` 或 `unavailable` 三态，并保存输入值与原因。

## 7. 后台任务模块

### 7.1 任务状态机

`queued -> running -> succeeded | failed | cancelled`。

任务进度至少包括总股票数、已处理数、成功数、跳过数、失败数与当前阶段。Worker 获取任务时采用原子状态更新，保证一个任务只被一个执行器处理。

### 7.2 主要任务

| 任务 | 输入 | 输出 |
|---|---|---|
| `refresh_universe` | Provider | 非 ST 股票池更新 |
| `sync_daily_bars` | 目标日、股票范围 | 日线、指标、同步报告 |
| `fetch_realtime_quotes` | 股票池 | 实时快照与质量状态 |
| `run_screening` | 规则版本、模式 | 筛选运行与结果 |
| `backup_database` | 数据版本 | 备份元数据与文件 |

Route Handler 只负责创建任务；Python Worker 领取并执行任务。不得在 HTTP 请求生命周期内直接循环处理 5,000 只股票。

## 8. API 与页面契约

建议的首期 API：

| 方法与路径 | 功能 |
|---|---|
| `POST /api/jobs/daily-sync` | 创建历史/盘后同步任务 |
| `POST /api/jobs/realtime-sync` | 创建实时行情任务 |
| `GET /api/jobs/:id` | 获取进度和错误摘要 |
| `GET /api/data-status` | 数据覆盖度与新鲜度 |
| `GET/POST /api/screening-rules` | 管理规则 |
| `POST /api/screening-runs` | 创建盘中或盘后筛选 |
| `GET /api/screening-runs/:id` | 读取结果与逐项判断 |
| `GET /api/stocks/:code` | 个股日线、指标、实时状态 |

页面调用 API 时只传递规则 ID、任务参数和展示筛选条件。供应商名称、令牌和原始请求不得下发到浏览器。

## 9. 备份、恢复与观测

- 每日盘后同步成功后，对 SQLite 数据库执行一致性备份；备份完成后校验文件存在与哈希。
- 恢复操作先创建当前数据库副本，再替换数据库文件，并执行数据库完整性检查。
- 同步和筛选页面展示最近任务状态，不展示敏感令牌或完整原始响应。
- 建议提供维护命令：数据库完整性检查、按股票重算指标、重试失败同步、列出异常日线。

## 10. 测试设计

### 10.1 Python 单元测试

- MA5/10/60 在样本不足、恰好足够、正常窗口时的结果；
- DKX、MADKX10 的参考样本与公式边界；
- 前复权实时转换与除零、缺锚点、异常因子处理；
- 规则三态判断和穿越条件；
- 非 ST 股票池过滤。

### 10.2 集成测试

- 同步 UPSERT 的幂等性；
- 成功同步后每只股票只保留 70 个交易日；
- 指标写入失败时不会删除旧数据；
- 实时快照不会覆盖正式日线；
- 任务状态机的并发领取与失败记录；
- SQLite 备份与恢复。

### 10.3 前端与端到端测试

- 用户点击数据同步后可看到进度与最终状态；
- 用户创建规则、发起盘后筛选并查看结果；
- 盘中数据缺少合格复权因子时，页面显示不可用原因；
- 个股详情图表与数据库指标数据一致。

## 11. Python Quant Worker 契约与扩展

Python Worker 从首期起只通过任务表和稳定数据表协作：

1. Next.js 创建 `quant_*` 任务，并写明参数版本、输入数据版本和输出目标。
2. Python Worker 领取任务，在只读快照或受控事务中运行回测/因子计算。
3. Python 写入独立的研究结果表和任务状态，不修改日线原始记录。
4. Next.js 读取结果并展示。

数据库 schema 的变更仍经 SQL migration 审核；Python 侧不应绕过迁移创建私有字段。
