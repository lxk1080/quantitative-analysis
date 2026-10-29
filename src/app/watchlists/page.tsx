"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ScreeningResults } from "../components/screening-results";
import { UsernameGate, useUsername } from "../components/username-gate";
import type { ScreeningResult } from "../lib/types";

type Day = { selectedDate: string; stockCount: number };
type Stock = {
  stockCode: string;
  stockName: string;
  ruleTitle: string;
  industry: string | null;
  addedAt: string;
};

export default function WatchlistsPage() {
  const { username, loaded, save } = useUsername();
  const [days, setDays] = useState<Day[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [opened, setOpened] = useState<Stock | null>(null);
  const [deleting, setDeleting] = useState<{
    date: string;
    code?: string;
  } | null>(null);
  const [error, setError] = useState("");

  const loadDays = useCallback(async () => {
    if (!username) return;
    const response = await fetch("/api/watchlists", {
      headers: { "x-quant-username": username },
      cache: "no-store",
    });
    if (response.ok) setDays(((await response.json()) as { days: Day[] }).days);
    else setError("历史记录加载失败");
  }, [username]);
  const loadStocks = useCallback(
    async (selectedDate: string) => {
      if (!username) return;
      const response = await fetch(`/api/watchlists/${selectedDate}`, {
        headers: { "x-quant-username": username },
        cache: "no-store",
      });
      if (response.ok)
        setStocks(((await response.json()) as { stocks: Stock[] }).stocks);
      else setError("自选股票加载失败");
    },
    [username],
  );

  useEffect(() => {
    void loadDays();
  }, [loadDays]);
  useEffect(() => {
    if (date) void loadStocks(date);
  }, [date, loadStocks]);

  async function confirmDelete() {
    if (!deleting || !username) return;
    const url = deleting.code
      ? `/api/watchlists/${deleting.date}/${deleting.code}`
      : `/api/watchlists/${deleting.date}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "x-quant-username": username },
    });
    if (!response.ok) {
      setError("删除失败，请重试");
      setDeleting(null);
      return;
    }
    if (deleting.code) {
      const remaining = stocks.filter(
        (item) => item.stockCode !== deleting.code,
      );
      setStocks(remaining);
      if (opened?.stockCode === deleting.code) setOpened(null);
      if (!remaining.length) setDate(null);
    } else if (date === deleting.date) {
      setDate(null);
      setStocks([]);
      setOpened(null);
    }
    setDeleting(null);
    await loadDays();
  }

  const chartResult: ScreeningResult = {
    run: {
      id: "watchlist",
      matchedCount: stocks.length,
      unavailableCount: 0,
      dataAsOf: date ?? "",
      mode: "post_close",
    },
    results: stocks.map((item) => ({
      stockCode: item.stockCode,
      name: item.stockName,
      status: "matched",
      currentPrice: null,
      detail: "",
    })),
  };

  return (
    <main className="shell">
      <div className="data-header">
        <h1 className="home-title">历史自选记录</h1>
        <Link className="button-link" href="/">
          返回首页
        </Link>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!date ? (
        <section className="panel">
          <h2>每日自选</h2>
          {days.length ? (
            <table>
              <thead>
                <tr>
                  <th>选股日期</th>
                  <th>自选股数量</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.selectedDate}>
                    <td>
                      <button
                        className="stock-link"
                        onClick={() => setDate(day.selectedDate)}
                      >
                        {day.selectedDate}
                      </button>
                    </td>
                    <td>{day.stockCount}</td>
                    <td>
                      <button
                        className="danger-button"
                        onClick={() => setDeleting({ date: day.selectedDate })}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">暂无自选记录。</p>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="data-header">
            <h2>{date} 的自选股</h2>
            <button
              onClick={() => {
                setDate(null);
                setOpened(null);
              }}
            >
              返回日期列表
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>股票代码</th>
                <th>股票名称</th>
                <th>筛选条件</th>
                <th>行业</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((item) => (
                <tr key={item.stockCode}>
                  <td>{item.stockCode}</td>
                  <td>
                    <button
                      className="stock-link"
                      onClick={() => setOpened(item)}
                    >
                      {item.stockName}
                    </button>
                  </td>
                  <td>{item.ruleTitle}</td>
                  <td>{item.industry ?? "暂无"}</td>
                  <td>
                    <button
                      className="danger-button"
                      onClick={() =>
                        setDeleting({ date, code: item.stockCode })
                      }
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {opened && username && (
        <ScreeningResults
          key={`${date}-${opened.stockCode}`}
          result={chartResult}
          username={username}
          ruleTitle={opened.ruleTitle}
          chartOnly
          initialStock={{ code: opened.stockCode, name: opened.stockName }}
          onClose={() => setOpened(null)}
        />
      )}
      {deleting && (
        <div className="inline-dialog-backdrop">
          <div className="inline-dialog" role="dialog" aria-modal="true">
            <h3>确认删除</h3>
            <p>
              {deleting.code
                ? "确定从这一天的自选中删除这只股票吗？"
                : `确定删除 ${deleting.date} 的整条自选记录吗？`}
            </p>
            <div className="inline-dialog-actions">
              <button onClick={() => setDeleting(null)}>取消</button>
              <button className="danger-primary" onClick={confirmDelete}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
      {loaded && !username && <UsernameGate onSave={save} />}
    </main>
  );
}
