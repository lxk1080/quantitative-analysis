# 量化分析

一个量化分析、条件筛选工具。Next.js 提供页面与 API，Python Quant Worker 负责数据同步、指标计算和筛选任务，SQLite 保存本地数据。

项目用于数据研究和条件筛选，不提供自动交易、投资建议或收益承诺。

## 当前能力

- 非 ST A 股数据池、日线同步与本地 SQLite 存储。
- 最近 90 个交易日的前复权 OHLC、成交量、MA5、MA10、MA60、DKX。
- 内置策略与可收藏的自定义条件；收藏方案按独立 JSON 文件保存。
- 盘中筛选、任务进度、结果说明、EBK 导出。
- 个股结果可打开本地日线窗口：滚轮缩放、左右拖动、成交量、MA5/10/60、DKX、涨停标识。
- 结果页可选择直接在新标签页打开同花顺个股页。
- 股票浏览、代码/名称/拼音搜索与分页。

筛选结果中的“不可用”表示本次筛选缺少判断所需的数据，不能判定该股票符合或不符合条件。盘中常见的直接原因是快照没有该股票的有效报价，或缺少生成前复权价格、计算指标所需的数据。可能与停牌、行情源漏报或异常、历史数据不足有关。当前结果页显示不可用数量，只列出命中股票。

## 环境

- Node.js 22+
- Python 3.12+

首次使用前，在项目根目录创建 `.env.local`，并配置 Tushare Token：

```dotenv
TUSHARE_TOKEN=你的_Tushare_Token
```

`TUSHARE_TOKEN` 是同步历史/盘后日线的必配项。其余环境变量均有默认值；例如数据库默认使用 `data/quant.db`、Python 默认使用系统 `python`、系统代理默认关闭，可参考 `.env.example`

## 首次启动

```powershell
npm install
python -m pip install -r requirements.txt
npm run db:migrate
npm run dev
```

`npm run dev` 会在 `http://127.0.0.1:3000` 启动开发服务器并自动打开浏览器。

点击同步或运行筛选时，服务端会创建任务，并按需启动一次 Python Worker 处理该任务，因此日常本地使用不必额外手动启动 Worker。

若希望持续处理队列，可另开终端运行：

```powershell
npm run worker
```

## 生产方式运行

```powershell
npm run build
npm run start
```

生产环境同样需要可用的 Python 运行环境。需要常驻处理任务时，再运行 `npm run worker`。

## 常用命令

```powershell
npm run db:migrate      # 应用 SQLite migration
npm run seed:demo       # 写入演示数据
npm run worker          # 常驻 Worker
npm run test:python     # Python 测试
npm run test:web        # Web 测试
npm run build           # TypeScript 与生产构建校验
```

## 自定义条件

同一个自定义方案中的已勾选条件按 AND 关系同时满足。当前支持：

- 去除 ST、科创板、北交所；
- N 个交易日前涨停；
- 最近 N 个交易日 K 线未破 MA；
- 连续 N 天收盘价在 DKX 上方；
- 近两个月涨幅排名；
- 连续 N 天涨幅区间；
- 最近 N 日区间涨幅上限；
- N 个交易日前量比下限；
- 收盘价相对 DKX 的偏离区间。

量比条件在盘中以累计成交量、已过交易分钟数和前 5 个交易日平均每分钟成交量计算；盘后或历史日则以目标日成交量与此前 5 日平均成交量计算。

## 本地 K 线说明

本地窗口读取最近最多 90 个有效交易日。上涨 K 线为空心红框、涨停为空心紫框、下跌为绿色实心；成交量柱使用相同涨跌色。涨停以原始昨收、板块涨停比例及 0.01 元价格单位的四舍五入结果判断，因此显示涨幅可能是 9.97% 或 9.98%，仍可能为真实涨停。

## 目录

```text
src/
  app/
    components/     页面组件：条件编辑、选择器、结果与本地 K 线
    lib/            前端类型与条件定义工具
    api/            Next.js Route Handlers
    stocks/         股票浏览与个股页
  db/               SQLite/Drizzle 访问层
quant_worker/       Python 数据、指标、规则与 Worker
drizzle/            SQLite migration
docs/               需求、架构和详细设计
scripts/            本地开发脚本
```

详细说明见 [需求文档](docs/requirements.md)、[架构文档](docs/architecture.md) 与 [详细设计](docs/detailed-design.md)。
