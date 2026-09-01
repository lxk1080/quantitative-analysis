"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Bar = { tradeDate: string; openQfq: number; highQfq: number; lowQfq: number; closeQfq: number; volume: number; amount: number | null; ma5: number | null; ma10: number | null; ma60: number | null; dkx: number | null; madkx10: number | null };
type Detail = { security: { code: string; name: string; exchange: string }; bars: Bar[]; error?: string };

export default function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void params.then(async ({ code }) => { const response = await fetch(`/api/stocks/${code}`, { cache: "no-store" }); if (response.ok) setData(await response.json()); else setError((await response.json()).error ?? "加载失败"); }); }, [params]);
  if (error) return <main className="shell"><section className="panel"><p>{error}</p><Link className="button-link" href="/stocks">返回数据浏览</Link></section></main>;
  return <main className="shell data-page"><header className="data-header"><div><p className="eyebrow">STOCK DETAIL</p><h1>{data ? `${data.security.code} · ${data.security.name}` : "正在加载股票详情…"}</h1><p className="lead">最近 70 根有效前复权日线与技术指标。</p></div><Link className="button-link" href="/stocks">返回列表</Link></header>{data && <section className="panel data-list"><div className="list-summary"><h2>最近 70 根日线</h2><span>{data.bars.length} 根</span></div><table><thead><tr><th>交易日</th><th>开盘</th><th>最高</th><th>最低</th><th>收盘</th><th>成交量（万手）</th><th>MA5</th><th>MA10</th><th>MA60</th><th>DKX</th></tr></thead><tbody>{data.bars.map((bar) => <tr key={bar.tradeDate}><td>{bar.tradeDate}</td><td>{n(bar.openQfq)}</td><td>{n(bar.highQfq)}</td><td>{n(bar.lowQfq)}</td><td className="close-price">{n(bar.closeQfq)}</td><td>{volumeWanShou(bar.volume)}</td><td>{n(bar.ma5)}</td><td>{n(bar.ma10)}</td><td>{n(bar.ma60)}</td><td>{n(bar.dkx)}</td></tr>)}</tbody></table></section>}</main>;
}

function n(value: number | null) { return value === null ? "—" : value.toFixed(2); }
function volumeWanShou(value: number) { return (value / 1_000_000).toFixed(2); }
