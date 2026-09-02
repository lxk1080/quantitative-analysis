import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type CustomCollection = {
  id: string;
  title: string;
  category: "custom";
  createdAt: string;
  updatedAt: string;
  config: Record<string, unknown>;
};

const collectionDirectory = path.join(process.cwd(), "quant_worker", "strategy_rules", "collections");

function filePath(id: string) {
  if (!/^[a-z0-9-]{8,80}$/i.test(id)) throw new Error("invalid collection id");
  return path.join(collectionDirectory, `${id}.json`);
}

async function ensureDirectory() { await fs.mkdir(collectionDirectory, { recursive: true }); }

export async function listCustomCollections(): Promise<CustomCollection[]> {
  await ensureDirectory();
  const entries = await fs.readdir(collectionDirectory, { withFileTypes: true });
  const values = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => {
    try { return JSON.parse(await fs.readFile(path.join(collectionDirectory, entry.name), "utf8")) as CustomCollection; } catch { return null; }
  }));
  return values.filter((value): value is CustomCollection => Boolean(value && value.id && value.category === "custom" && value.config)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createCustomCollection(config: Record<string, unknown>, title: string): Promise<CustomCollection> {
  await ensureDirectory();
  const now = new Date().toISOString();
  const value: CustomCollection = { id: `custom-${randomUUID()}`, title, category: "custom", createdAt: now, updatedAt: now, config };
  await fs.writeFile(filePath(value.id), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return value;
}

export async function updateCustomCollection(id: string, config: Record<string, unknown>, title?: string): Promise<CustomCollection | null> {
  try {
    const current = JSON.parse(await fs.readFile(filePath(id), "utf8")) as CustomCollection;
    const value: CustomCollection = { ...current, title: title?.trim() || current.title, category: "custom", updatedAt: new Date().toISOString(), config };
    await fs.writeFile(filePath(id), `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return value;
  } catch { return null; }
}

export async function deleteCustomCollection(id: string): Promise<boolean> {
  try { await fs.unlink(filePath(id)); return true; } catch { return false; }
}

export async function getCustomCollection(id: string): Promise<CustomCollection | null> {
  try { return JSON.parse(await fs.readFile(filePath(id), "utf8")) as CustomCollection; } catch { return null; }
}

export function collectionDefinition(config: Record<string, unknown>) {
  const v = (key: string, fallback = 0) => Number(config[key] ?? fallback);
  const on = (key: string) => config[key] === true;
  const conditions: Array<Record<string, string | number>> = [];
  if (on("excludeSt")) conditions.push({ type: "exclude_st" }); if (on("excludeStar")) conditions.push({ type: "exclude_star" }); if (on("excludeBj")) conditions.push({ type: "exclude_bj" });
  if (on("limitUp")) conditions.push({ type: "limit_up_days_ago", days_ago: v("limitDays", 3) }); if (on("klineMa")) conditions.push({ type: "kline_above_ma", days: v("klineDays", 3), ma_days: v("maDays", 5) }); if (on("closeDkx")) conditions.push({ type: "close_above_dkx_days", days: v("closeDkxDays", 9) }); if (on("rank")) conditions.push({ type: "two_month_return_rank", top: v("rankTop", 30) }); if (on("dailyRange")) conditions.push({ type: "daily_return_range", days: v("dailyRangeDays", 4), lower: v("dailyRangeLower"), upper: v("dailyRangeUpper", 3) }); if (on("interval")) conditions.push({ type: "interval_return_below", days: v("intervalDays", 4), maximum: v("intervalMaximum") }); if (on("deviation")) conditions.push({ type: "close_dkx_deviation", lower: v("deviationLower", -2), days_ago: v("deviationDaysAgo"), upper: v("deviationUpper", 5) });
  return { version: 1, operator: "all", conditions };
}
