# 量化分析

本地运行的 A 股量化选股基础应用：Next.js 提供操作界面和任务交互，Python Quant Worker 负责前复权日线、指标与全市场筛选，SQLite 保存两侧共用的数据契约。

当前已实现：

- SQLite/Drizzle 数据模型与版本化 SQL migration；
- 非 ST 股票池、90 个交易日保留、前复权字段和实时快照的数据契约；
- MA5、MA10、MA60、DKX、MADKX10 的纯 Python 指标引擎；
- 盘后筛选任务、条件三态结果及 Python Worker；
- Next.js 数据概览、演示数据初始化和盘后筛选界面；
- 明确标记的演示数据，用于验证端到端链路。

默认真实行情 Provider 为 AKShare 多源公开接口：股票池、实时快照和前复权/未复权日线按“腾讯 → 东方财富 → 新浪”顺序降级，并逐条保存实际来源。当前 AKShare 版本没有同花顺同口径的全市场实时价、全市场股票池或个股前复权日线接口；其看似“全部 A 股”的 `stock_ipo_ths` 实际是新股申购数据，不能误作股票池或价格源。同花顺保留给后续真正适合的板块、财务等因子数据。公开源会受网络、限流和上游字段变化影响；同步失败时应用会保留既有有效数据并记录错误，不会补造数值。演示数据仍不会被伪装成真实市场数据，也不能用于投资判断。

## 环境

- Node.js 22+
- Python 3.12+

## 启动

```powershell
npm.cmd install
python -m pip install -r requirements.txt
python -m quant_worker.cli migrate
npm.cmd run dev
```

启动成功后会自动打开默认浏览器并访问 `http://127.0.0.1:3000`。首次可点击“初始化演示数据”，再运行“盘后筛选”验证完整流程。

若需要在页面外持续处理任务，可另开一个终端：

```powershell
python -m quant_worker.cli worker --loop
```

## 验证

```powershell
python -m unittest discover -s quant_worker/tests -v
npm.cmd run build
```

## 关键目录

- `src/app`：Next.js 页面与 Route Handlers。
- `src/db`：Drizzle schema、SQLite 客户端。
- `quant_worker`：Python 的数据、指标、规则与任务实现。
- `drizzle`：Node.js 与 Python 共同使用的 SQL schema migration。
- `docs`：需求、概要设计与详细设计。

## 真实数据同步

页面中的“同步真实盘后日线”会先刷新非 ST 股票池，再按照腾讯 → 东方财富 → 新浪尝试同一来源的前复权/未复权日线、计算指标，并在每只股票成功更新后只保留最近 70 个交易日。每次来源切换及来源统计都会写入 `sync_audit_logs`。首次全市场补数需要大量公开接口请求，耗时较长且可能被上游限流；建议盘后执行并保持页面打开以观察进度。

“获取实时行情”将公开实时价与最近一个完整交易日的复权因子结合，生成前复权等价实时价格。复权锚点缺失、上游异常或价格不可信时，股票会标为不可用，不会参与盘中价格条件。

如需更换为商业数据源，只需在 `quant_worker/providers/` 实现 `MarketDataProvider`；同步、指标、筛选和数据库层无需改动。
