import "server-only";

import { rawDb } from "@/db/client";

export type ScreeningPreset = {
  id: string;
  title: string;
  description: string;
};

// This catalogue is intentionally separate from the rule evaluator.  A new
// preset needs one focused Python module and one small metadata entry here.
const catalog: ScreeningPreset[] = [
  {
    id: "n-pattern-rule",
    title: "N字战法",
    description: "3个交易日前涨停，最近3个交易日的K线未破5日线，去除ST，去除科创板，去除北交所",
  },
  {
    id: "mid-term-trend-rule",
    title: "中线趋势",
    description: "前9天每天的收盘价都在DKX之上；-0.02 < (今日收盘价-今日DKX)/今日DKX < 0.05；去除ST、科创板、北交所",
  },
  {
    id: "n-low-absorption-rule",
    title: "N字低吸",
    description: "4个交易日前涨停，最近4个交易日的区间涨幅小于0，去除ST，去除科创板，去除北交所",
  },
];

export function getScreeningPresets(): ScreeningPreset[] {
  const existing = new Set((rawDb.prepare("SELECT id FROM screening_rules").all() as Array<{ id: string }>).map((item) => item.id));
  return catalog.filter((preset) => existing.has(preset.id));
}

export const DEFAULT_PRESET_ID = "n-pattern-rule";
