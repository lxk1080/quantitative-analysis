import "server-only";

import { rawDb } from "@/db/client";

export type WatchlistStock = {
  stockCode: string;
  stockName: string;
  ruleTitle: string;
  industry: string | null;
  addedAt: string;
};

export function todayShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function listWatchlistDays(username: string) {
  return rawDb
    .prepare(
      `SELECT d.selected_date AS selectedDate, COUNT(s.stock_code) AS stockCount
    FROM daily_watchlists d LEFT JOIN daily_watchlist_stocks s
      ON s.username=d.username AND s.selected_date=d.selected_date
    WHERE d.username=? GROUP BY d.selected_date ORDER BY d.selected_date DESC`,
    )
    .all(username) as Array<{ selectedDate: string; stockCount: number }>;
}

export function getWatchlistDay(
  username: string,
  date: string,
): WatchlistStock[] | null {
  const day = rawDb
    .prepare(
      "SELECT 1 FROM daily_watchlists WHERE username=? AND selected_date=?",
    )
    .get(username, date);
  if (!day) return null;
  return rawDb
    .prepare(
      `SELECT stock_code AS stockCode,stock_name AS stockName,rule_title AS ruleTitle,industry,added_at AS addedAt
    FROM daily_watchlist_stocks WHERE username=? AND selected_date=? ORDER BY added_at,stock_code`,
    )
    .all(username, date) as WatchlistStock[];
}

export function addWatchlistStock(
  username: string,
  stockCode: string,
  ruleTitle: string,
  industry: string | null,
) {
  const security = rawDb
    .prepare("SELECT name FROM securities WHERE code=?")
    .get(stockCode) as { name: string } | undefined;
  if (!security) return { status: "not_found" as const };
  const date = todayShanghai();
  const now = new Date().toISOString();
  const result = rawDb.transaction(() => {
    rawDb
      .prepare(
        "INSERT OR IGNORE INTO daily_watchlists(username,selected_date,created_at) VALUES (?,?,?)",
      )
      .run(username, date, now);
    return rawDb
      .prepare(
        `INSERT OR IGNORE INTO daily_watchlist_stocks
      (username,selected_date,stock_code,stock_name,rule_title,industry,added_at) VALUES (?,?,?,?,?,?,?)`,
      )
      .run(username, date, stockCode, security.name, ruleTitle, industry, now);
  })();
  return {
    status: result.changes ? ("added" as const) : ("exists" as const),
    date,
  };
}

export function deleteWatchlistDay(username: string, date: string): boolean {
  return (
    rawDb
      .prepare(
        "DELETE FROM daily_watchlists WHERE username=? AND selected_date=?",
      )
      .run(username, date).changes > 0
  );
}

export function deleteWatchlistStock(
  username: string,
  date: string,
  code: string,
): boolean {
  return rawDb.transaction(() => {
    const result = rawDb
      .prepare(
        "DELETE FROM daily_watchlist_stocks WHERE username=? AND selected_date=? AND stock_code=?",
      )
      .run(username, date, code);
    if (result.changes) {
      const count = rawDb
        .prepare(
          "SELECT 1 FROM daily_watchlist_stocks WHERE username=? AND selected_date=? LIMIT 1",
        )
        .get(username, date);
      if (!count)
        rawDb
          .prepare(
            "DELETE FROM daily_watchlists WHERE username=? AND selected_date=?",
          )
          .run(username, date);
    }
    return result.changes > 0;
  })();
}
