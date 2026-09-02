import { NextResponse } from "next/server";

import { rawDb } from "@/db/client";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 70);
  const days = Number.isInteger(requestedDays) ? Math.min(90, Math.max(1, requestedDays)) : 70;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "股票代码格式无效" }, { status: 400 });
  const security = rawDb.prepare(
    "SELECT code, name, exchange FROM securities WHERE code=? AND security_type='A_SHARE' AND is_st=0 AND is_active=1",
  ).get(code);
  if (!security) return NextResponse.json({ error: "未找到该股票" }, { status: 404 });
  const bars = rawDb.prepare(
    `SELECT b.trade_date AS tradeDate, b.open_qfq AS openQfq, b.high_qfq AS highQfq, b.low_qfq AS lowQfq,
            b.close_qfq AS closeQfq, r.close_price AS rawClose, r.pre_close AS preClose,
            b.volume, b.amount, i.ma5, i.ma10, i.ma60, i.dkx, i.madkx10
       FROM daily_bars b
       LEFT JOIN daily_indicators i ON i.stock_code=b.stock_code AND i.trade_date=b.trade_date
       LEFT JOIN daily_raw_bars r ON r.stock_code=b.stock_code AND r.trade_date=b.trade_date
      WHERE b.stock_code=? AND b.quality_status='valid'
      ORDER BY b.trade_date DESC LIMIT ?`,
  ).all(code, days);
  return NextResponse.json({ security, bars });
}
