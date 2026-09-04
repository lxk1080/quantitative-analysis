import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { rawDb } from "@/db/client";

export const runtime = "nodejs";

type StoredBar = {
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

type SnapshotBar = {
  stock_code: string;
  quote_time: string;
  open_price: number;
  high_price: number;
  low_price: number;
  last_price: number;
  pre_close: number;
  volume: number | null;
};

const snapshotDirectory = path.join(process.cwd(), "caches");
const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const shanghaiTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function shanghaiDate(value: string | Date) {
  const parts = shanghaiDateFormatter.formatToParts(new Date(value));
  const item = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${item("year")}-${item("month")}-${item("day")}`;
}

function canUseSnapshot(capturedAt: string) {
  const now = new Date();
  const captured = new Date(capturedAt);
  if (
    Number.isNaN(captured.getTime()) ||
    shanghaiDate(captured) !== shanghaiDate(now)
  ) {
    return false;
  }
  const [hour, minute] = shanghaiTimeFormatter
    .format(now)
    .split(":")
    .map(Number);
  const afterClose = hour > 15 || (hour === 15 && minute >= 0);
  if (afterClose) return shanghaiTimeFormatter.format(captured) >= "15:00";
  return now.getTime() - captured.getTime() <= 5 * 60 * 1000;
}

function average(values: number[], days: number) {
  const window = values.slice(-days);
  return window.length === days
    ? window.reduce((sum, value) => sum + value, 0) / days
    : null;
}

async function loadSnapshotBar(code: string) {
  try {
    const names = (await fs.readdir(snapshotDirectory))
      .filter((name) => /^realtime-snapshot-\d{8}-\d{6}\.json$/.test(name))
      .sort()
      .reverse();
    for (const name of names) {
      const payload = JSON.parse(
        await fs.readFile(path.join(snapshotDirectory, name), "utf8"),
      ) as { captured_at?: string; bars?: SnapshotBar[] };
      if (!payload.captured_at || !canUseSnapshot(payload.captured_at))
        continue;
      return payload.bars?.find((bar) => bar.stock_code === code) ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function buildIntradayBar(code: string, bars: StoredBar[]) {
  const snapshot = await loadSnapshotBar(code);
  if (!snapshot) return null;
  const tradeDate = shanghaiDate(snapshot.quote_time);
  if (bars.some((bar) => bar.tradeDate === tradeDate)) return null;
  const anchor = bars.find((bar) => bar.rawClose !== null && bar.rawClose > 0);
  if (!anchor || anchor.rawClose === null) return null;

  const factor = anchor.closeQfq / anchor.rawClose;
  const intraday: StoredBar = {
    tradeDate,
    openQfq: snapshot.open_price * factor,
    highQfq: snapshot.high_price * factor,
    lowQfq: snapshot.low_price * factor,
    closeQfq: snapshot.last_price * factor,
    rawClose: snapshot.last_price,
    preClose: snapshot.pre_close,
    volume: snapshot.volume ?? 0,
    ma5: null,
    ma10: null,
    ma60: null,
    dkx: null,
  };
  const history = [...bars].reverse();
  const closes = [...history.map((bar) => bar.closeQfq), intraday.closeQfq];
  intraday.ma5 = average(closes, 5);
  intraday.ma10 = average(closes, 10);
  intraday.ma60 = average(closes, 60);
  const mids = [...history, intraday].map(
    (bar) => (3 * bar.closeQfq + bar.openQfq + bar.highQfq + bar.lowQfq) / 6,
  );
  if (mids.length >= 21) {
    intraday.dkx =
      (mids
        .slice(-19)
        .reverse()
        .reduce((sum, mid, index) => sum + (20 - index) * mid, 0) +
        mids.at(-21)!) /
      210;
  }
  return intraday;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const requestedDays = Number(
    new URL(request.url).searchParams.get("days") ?? 70,
  );
  const days = Number.isInteger(requestedDays)
    ? Math.min(90, Math.max(1, requestedDays))
    : 70;
  if (!/^\d{6}$/.test(code))
    return NextResponse.json({ error: "股票代码格式无效" }, { status: 400 });
  const security = rawDb
    .prepare(
      "SELECT code, name, exchange FROM securities WHERE code=? AND security_type='A_SHARE' AND is_st=0 AND is_active=1",
    )
    .get(code);
  if (!security)
    return NextResponse.json({ error: "未找到该股票" }, { status: 404 });
  const bars = rawDb
    .prepare(
      `SELECT b.trade_date AS tradeDate, b.open_qfq AS openQfq, b.high_qfq AS highQfq, b.low_qfq AS lowQfq,
            b.close_qfq AS closeQfq, r.close_price AS rawClose, r.pre_close AS preClose,
            b.volume, b.amount, i.ma5, i.ma10, i.ma60, i.dkx, i.madkx10
       FROM daily_bars b
       LEFT JOIN daily_indicators i ON i.stock_code=b.stock_code AND i.trade_date=b.trade_date
       LEFT JOIN daily_raw_bars r ON r.stock_code=b.stock_code AND r.trade_date=b.trade_date
      WHERE b.stock_code=? AND b.quality_status='valid'
      ORDER BY b.trade_date DESC LIMIT ?`,
    )
    .all(code, days) as StoredBar[];
  const intradayBar = await buildIntradayBar(code, bars);
  return NextResponse.json({ security, bars, intradayBar });
}
