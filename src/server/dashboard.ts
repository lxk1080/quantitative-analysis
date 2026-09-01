import "server-only";

import { rawDb } from "@/db/client";
import { DEFAULT_PRESET_ID } from "@/server/screening-presets";

type ScalarRow = { value: number | string | null };

function scalar(sql: string): number | string | null {
  return (rawDb.prepare(sql).get() as ScalarRow | undefined)?.value ?? null;
}

function databaseReady(): boolean {
  return rawDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='securities'").get() !== undefined;
}

export type DashboardStatus = {
  ready: boolean;
  securities: number;
  dailyBars: number;
  latestTradeDate: string | null;
  latestQuoteAt: string | null;
  pendingJobs: number;
  latestJob: { id: string; kind: string; status: string; createdAt: string; summary?: string | null } | null;
  defaultRuleId: string | null;
};

export function getDashboardStatus(): DashboardStatus {
  if (!databaseReady()) {
    return { ready: false, securities: 0, dailyBars: 0, latestTradeDate: null, latestQuoteAt: null, pendingJobs: 0, latestJob: null, defaultRuleId: null };
  }
  const latestJob = rawDb.prepare(
    "SELECT id, kind, status, created_at AS createdAt, summary_json AS summary FROM sync_jobs ORDER BY created_at DESC LIMIT 1",
  ).get() as DashboardStatus["latestJob"];
  const defaultRule = rawDb.prepare("SELECT id FROM screening_rules WHERE id=?").get(DEFAULT_PRESET_ID) as { id: string } | undefined;
  return {
    ready: true,
    securities: Number(scalar("SELECT COUNT(*) AS value FROM securities WHERE security_type='A_SHARE' AND is_st=0 AND is_active=1")),
    dailyBars: Number(scalar("SELECT COUNT(*) AS value FROM daily_bars WHERE quality_status='valid'")),
    latestTradeDate: scalar("SELECT MAX(trade_date) AS value FROM daily_bars") as string | null,
    latestQuoteAt: scalar("SELECT MAX(fetched_at) AS value FROM realtime_quotes") as string | null,
    pendingJobs: Number(scalar("SELECT COUNT(*) AS value FROM sync_jobs WHERE status IN ('queued','running')")),
    latestJob: latestJob ?? null,
    defaultRuleId: defaultRule?.id ?? null,
  };
}

export function getRun(runId: string) {
  const run = rawDb.prepare(
    "SELECT id, rule_id AS ruleId, mode, data_as_of AS dataAsOf, status, matched_count AS matchedCount, unavailable_count AS unavailableCount FROM screening_runs WHERE id=?",
  ).get(runId);
  if (!run) return null;
  const results = rawDb.prepare(
    `SELECT r.stock_code AS stockCode, s.name, r.status, r.current_price AS currentPrice, r.detail_json AS detail
       FROM screening_results r JOIN securities s ON s.code=r.stock_code
       WHERE r.run_id=? AND r.status='matched' ORDER BY r.stock_code`,
  ).all(runId);
  return { run, results };
}

export function getRunEbk(runId: string): { fileName: string; content: string } | null {
  const run = rawDb.prepare(
    `SELECT r.data_as_of AS dataAsOf, rule.name AS ruleName
       FROM screening_runs r JOIN screening_rules rule ON rule.id=r.rule_id
       WHERE r.id=?`,
  ).get(runId) as { dataAsOf: string; ruleName: string } | undefined;
  if (!run) return null;
  const rows = rawDb.prepare(
    `SELECT s.code, s.exchange
       FROM screening_results result JOIN securities s ON s.code=result.stock_code
       WHERE result.run_id=? AND result.status='matched'
       ORDER BY s.exchange, s.code`,
  ).all(runId) as Array<{ code: string; exchange: string }>;
  const lines = rows.flatMap(({ code, exchange }) => {
    const prefix = exchange === "SH" ? "1" : exchange === "SZ" ? "0" : null;
    return prefix ? [`${prefix}${code}`] : [];
  });
  const date = run.dataAsOf.replaceAll("-", "");
  return { fileName: `${run.ruleName}-${date}.EBK`, content: lines.length ? `${lines.join("\r\n")}\r\n` : "" };
}
