import type { CustomConfig, RuleChoice, Status } from "./types";

export const emptyStatus: Status = {
  ready: false,
  securities: 0,
  dailyBars: 0,
  latestTradeDate: null,
  pendingJobs: 0,
  defaultRuleId: null,
};

export const initialCustom: CustomConfig = {
  excludeSt: true,
  excludeStar: true,
  excludeBj: true,
  limitUp: false,
  limitDays: 3,
  klineMa: false,
  klineDays: 3,
  maDays: 5,
  closeDkx: false,
  closeDkxDays: 9,
  rank: false,
  rankTop: 30,
  dailyRange: false,
  dailyRangeDays: 4,
  dailyRangeLower: 0,
  dailyRangeUpper: 3,
  interval: false,
  intervalDays: 4,
  intervalMaximum: 0,
  volumeRatio: false,
  volumeRatioDays: 0,
  volumeRatioMinimum: 3,
  deviation: false,
  deviationLower: -2,
  deviationDaysAgo: 0,
  deviationUpper: 5,
};

export const directCustomChoice = (config: CustomConfig): RuleChoice => ({
  id: "custom-rule",
  title: "自定义条件",
  description: customSummary(config),
  category: "custom",
  config,
});

export function buildCustomDefinition(c: CustomConfig) {
  const conditions: Array<Record<string, number | string>> = [];
  if (c.excludeSt) conditions.push({ type: "exclude_st" });
  if (c.excludeStar) conditions.push({ type: "exclude_star" });
  if (c.excludeBj) conditions.push({ type: "exclude_bj" });
  if (c.limitUp)
    conditions.push({ type: "limit_up_days_ago", days_ago: c.limitDays });
  if (c.klineMa)
    conditions.push({
      type: "kline_above_ma",
      days: c.klineDays,
      ma_days: c.maDays,
    });
  if (c.closeDkx)
    conditions.push({ type: "close_above_dkx_days", days: c.closeDkxDays });
  if (c.rank)
    conditions.push({ type: "two_month_return_rank", top: c.rankTop });
  if (c.dailyRange)
    conditions.push({
      type: "daily_return_range",
      days: c.dailyRangeDays,
      lower: c.dailyRangeLower,
      upper: c.dailyRangeUpper,
    });
  if (c.interval)
    conditions.push({
      type: "interval_return_below",
      days: c.intervalDays,
      maximum: c.intervalMaximum,
    });
  if (c.volumeRatio)
    conditions.push({
      type: "volume_ratio_days_ago",
      days_ago: c.volumeRatioDays,
      minimum: c.volumeRatioMinimum,
    });
  if (c.deviation)
    conditions.push({
      type: "close_dkx_deviation",
      lower: c.deviationLower,
      days_ago: c.deviationDaysAgo,
      upper: c.deviationUpper,
    });
  return { version: 1, operator: "all" as const, conditions };
}

export function customSummary(c: CustomConfig) {
  const parts: string[] = [];
  if (c.excludeSt) parts.push("去除 ST");
  if (c.excludeStar) parts.push("去除科创板");
  if (c.excludeBj) parts.push("去除北交所");
  if (c.limitUp) parts.push(`${c.limitDays} 个交易日前涨停`);
  if (c.klineMa)
    parts.push(`最近 ${c.klineDays} 个交易日的 K 线未破 ${c.maDays} 日线`);
  if (c.closeDkx)
    parts.push(`前 ${c.closeDkxDays} 天每天的收盘价都在 DKX 之上`);
  if (c.rank) parts.push(`近两个月涨幅排名前 ${c.rankTop}`);
  if (c.dailyRange)
    parts.push(
      `连续 ${c.dailyRangeDays} 天的涨幅都在 ${c.dailyRangeLower}% 到 ${c.dailyRangeUpper}% 之间`,
    );
  if (c.interval)
    parts.push(
      `最近 ${c.intervalDays} 个交易日的区间涨幅小于 ${c.intervalMaximum}%`,
    );
  if (c.volumeRatio)
    parts.push(
      `${c.volumeRatioDays} 个交易日前的量比大于 ${c.volumeRatioMinimum}`,
    );
  if (c.deviation)
    parts.push(
      `${c.deviationLower}% < ${c.deviationDaysAgo} 天前收盘价相对 DKX 偏离 < ${c.deviationUpper}%`,
    );
  return parts.join("；") || "尚未启用任何条件";
}
