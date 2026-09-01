import { NextRequest, NextResponse } from "next/server";
import { pinyin } from "pinyin-pro";

import { rawDb } from "@/db/client";

export const runtime = "nodejs";

const PAGE_SIZE = 50;

type StockListRow = {
  code: string;
  name: string;
  exchange: string;
  tradeDate: string | null;
  closeQfq: number | null;
  volume: number | null;
  ma5: number | null;
  ma10: number | null;
  ma60: number | null;
  dkx: number | null;
};

function pinyinParts(name: string): string[] {
  return pinyin(name, { toneType: "none", type: "array" });
}

function matches(row: StockListRow, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  if (row.code.includes(normalized) || row.name.toLowerCase().includes(normalized)) return true;
  const parts = pinyinParts(row.name).map((item) => item.toLowerCase());
  return parts.join("").includes(normalized) || parts.map((item) => item[0] ?? "").join("").includes(normalized);
}

export function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedPage = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const rows = rawDb.prepare(
    `SELECT s.code, s.name, s.exchange,
            b.trade_date AS tradeDate, b.close_qfq AS closeQfq, b.volume,
            i.ma5, i.ma10, i.ma60, i.dkx
       FROM securities s
       LEFT JOIN daily_bars b ON b.stock_code=s.code
        AND b.trade_date=(SELECT MAX(last_bar.trade_date) FROM daily_bars last_bar WHERE last_bar.stock_code=s.code)
       LEFT JOIN daily_indicators i ON i.stock_code=b.stock_code AND i.trade_date=b.trade_date
      WHERE s.security_type='A_SHARE' AND s.is_st=0 AND s.is_active=1
      ORDER BY b.trade_date DESC, s.code ASC`,
  ).all() as StockListRow[];
  const filtered = rows.filter((row) => matches(row, search));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  return NextResponse.json({ items: filtered.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: filtered.length, totalPages });
}
