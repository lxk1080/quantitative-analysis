import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const securities = sqliteTable("securities", {
  code: text("code").primaryKey(),
  exchange: text("exchange").notNull(),
  name: text("name").notNull(),
  securityType: text("security_type").notNull(),
  isSt: integer("is_st", { mode: "boolean" }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  listedAt: text("listed_at"),
  updatedAt: text("updated_at").notNull(),
});

export const dailyBars = sqliteTable("daily_bars", {
  stockCode: text("stock_code").notNull(),
  tradeDate: text("trade_date").notNull(),
  openQfq: real("open_qfq").notNull(),
  highQfq: real("high_qfq").notNull(),
  lowQfq: real("low_qfq").notNull(),
  closeQfq: real("close_qfq").notNull(),
  volume: integer("volume").notNull(),
  amount: real("amount"),
  turnoverRate: real("turnover_rate"),
  rawClose: real("raw_close"),
  providerName: text("provider_name").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  dataVersion: integer("data_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
}, (table) => [
  primaryKey({ columns: [table.stockCode, table.tradeDate] }),
  index("daily_bars_trade_date_code_idx").on(table.tradeDate, table.stockCode),
  index("daily_bars_code_date_idx").on(table.stockCode, table.tradeDate),
]);

export const dailyIndicators = sqliteTable("daily_indicators", {
  stockCode: text("stock_code").notNull(),
  tradeDate: text("trade_date").notNull(),
  ma5: real("ma5"),
  ma10: real("ma10"),
  ma60: real("ma60"),
  dkx: real("dkx"),
  madkx10: real("madkx10"),
  indicatorVersion: text("indicator_version").notNull(),
  sourceDataVersion: integer("source_data_version").notNull(),
  calculatedAt: text("calculated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.stockCode, table.tradeDate] })]);

export const realtimeQuotes = sqliteTable("realtime_quotes", {
  stockCode: text("stock_code").primaryKey(),
  quoteTime: text("quote_time").notNull(),
  rawLastPrice: real("raw_last_price").notNull(),
  qfqLastPrice: real("qfq_last_price"),
  volume: integer("volume"),
  amount: real("amount"),
  qfqFactor: real("qfq_factor"),
  qualityStatus: text("quality_status").notNull(),
  providerName: text("provider_name").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const syncJobs = sqliteTable("sync_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull(),
  progressCurrent: integer("progress_current").notNull(),
  progressTotal: integer("progress_total").notNull(),
  summaryJson: text("summary_json"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const screeningRules = sqliteTable("screening_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  definitionJson: text("definition_json").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const screeningRuns = sqliteTable("screening_runs", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  mode: text("mode").notNull(),
  dataAsOf: text("data_as_of").notNull(),
  status: text("status").notNull(),
  matchedCount: integer("matched_count").notNull(),
  unavailableCount: integer("unavailable_count").notNull(),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
});

export const screeningResults = sqliteTable("screening_results", {
  runId: text("run_id").notNull(),
  stockCode: text("stock_code").notNull(),
  status: text("status").notNull(),
  currentPrice: real("current_price"),
  detailJson: text("detail_json").notNull(),
}, (table) => [primaryKey({ columns: [table.runId, table.stockCode] })]);
