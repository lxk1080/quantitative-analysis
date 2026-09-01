"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StockRow = { code: string; name: string; exchange: string; tradeDate: string | null; closeQfq: number | null; volume: number | null; ma5: number | null; ma10: number | null; ma60: number | null; dkx: number | null };
type StockResponse = { items: StockRow[]; page: number; pageSize: number; total: number; totalPages: number };

export default function StocksPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const response = await fetch(`/api/stocks?q=${encodeURIComponent(search)}&page=${page}`, { cache: "no-store" });
      if (!cancelled && response.ok) setData(await response.json());
      if (!cancelled) setLoading(false);
    }, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, page]);

  return <main className="shell data-page">
    <header className="data-header"><div><p className="eyebrow">LOCAL QUANT RESEARCH</p><h1>股票数据浏览</h1><p className="lead">默认显示每只非 ST 股票最新一根前复权日线及技术指标。</p></div><Link className="button-link" href="/">返回选股首页</Link></header>
    <section className="panel data-toolbar"><label htmlFor="stock-search">搜索股票</label><input id="stock-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="代码、名称、拼音或首字母，例如 300862 / 蓝盾光电 / ldgd" autoComplete="off" /><p className="muted">支持完整拼音与首字母拼音。每页 50 条。</p></section>
    <section className="panel data-list"><div className="list-summary"><h2>最新数据</h2><span>{loading ? "正在加载…" : `共 ${data?.total ?? 0} 只`}</span></div><table><thead><tr><th>代码</th><th>名称</th><th>交易日</th><th>收盘（前复权）</th><th>MA5</th><th>MA10</th><th>MA60</th><th>DKX</th><th /></tr></thead><tbody>{data?.items.map((row) => <tr key={row.code}><td>{row.code}</td><td>{row.name}</td><td>{row.tradeDate ?? "—"}</td><td className="close-price">{formatNumber(row.closeQfq)}</td><td>{formatNumber(row.ma5)}</td><td>{formatNumber(row.ma10)}</td><td>{formatNumber(row.ma60)}</td><td>{formatNumber(row.dkx)}</td><td><Link className="row-action" href={`/stocks/${row.code}`}>详情</Link></td></tr>)}{!loading && data?.items.length === 0 && <tr><td colSpan={9} className="empty-cell">没有匹配的股票。</td></tr>}</tbody></table><div className="pagination"><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || (data?.page ?? 1) <= 1}>上一页</button><span>第 {data?.page ?? 1} / {data?.totalPages ?? 1} 页</span><button onClick={() => setPage((value) => Math.min(data?.totalPages ?? value, value + 1))} disabled={loading || (data?.page ?? 1) >= (data?.totalPages ?? 1)}>下一页</button></div></section>
  </main>;
}

function formatNumber(value: number | null) { return value === null ? "—" : value.toFixed(2); }
