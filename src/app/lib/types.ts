export type Status = {
  ready: boolean;
  securities: number;
  dailyBars: number;
  latestTradeDate: string | null;
  pendingJobs: number;
  defaultRuleId: string | null;
};

export type Job = {
  status: "queued" | "running" | "succeeded" | "failed";
  progressCurrent: number;
  progressTotal: number;
  summary?: string | null;
  error?: string | null;
};

export type Preset = { id: string; title: string; description: string };

export type CustomConfig = {
  excludeSt: boolean;
  excludeStar: boolean;
  excludeBj: boolean;
  limitUp: boolean;
  limitDays: number;
  klineMa: boolean;
  klineDays: number;
  maDays: number;
  closeDkx: boolean;
  closeDkxDays: number;
  rank: boolean;
  rankTop: number;
  dailyRange: boolean;
  dailyRangeDays: number;
  dailyRangeLower: number;
  dailyRangeUpper: number;
  interval: boolean;
  intervalDays: number;
  intervalMaximum: number;
  volumeRatio: boolean;
  volumeRatioDays: number;
  volumeRatioMinimum: number;
  deviation: boolean;
  deviationLower: number;
  deviationDaysAgo: number;
  deviationUpper: number;
};

export type RuleChoice = {
  id: string;
  title: string;
  description: string;
  category: "preset" | "custom";
  config?: CustomConfig;
};

export type ScreeningResult = {
  snapshotCapturedAt?: string | null;
  run: {
    id: string;
    matchedCount: number;
    unavailableCount: number;
    dataAsOf: string;
    mode: string;
  };
  results: Array<{
    stockCode: string;
    name: string;
    status: string;
    currentPrice: number | null;
    detail: string;
  }>;
};

export type StockBar = {
  tradeDate: string;
  openQfq: number;
  highQfq: number;
  lowQfq: number;
  closeQfq: number;
  rawClose: number | null;
  preClose: number | null;
  volume: number;
  ma5: number | null;
  ma10: number | null;
  ma60: number | null;
  dkx: number | null;
};
