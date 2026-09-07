"use client";

import { useEffect, useRef, useState } from "react";

import type { ScreeningResult, StockBar } from "../lib/types";

export function ScreeningResults({ result }: { result: ScreeningResult }) {
  const [stock, setStock] = useState<{ code: string; name: string } | null>(
    null,
  );
  const [use10jqka, setUse10jqka] = useState(false);
  const [quote, setQuote] = useState<{
    price: number;
    changePercent: number;
  } | null>(null);
  const [position, setPosition] = useState({ x: 80, y: 80 });
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const url = stock ? `https://stockpage.10jqka.com.cn/${stock.code}/` : "";
  const f10Url = stock ? `https://basic.10jqka.com.cn/${stock.code}/` : "";
  const stockIndex = stock
    ? result.results.findIndex((row) => row.stockCode === stock.code)
    : -1;

  useEffect(() => {
    setQuote(null);
  }, [stock?.code]);

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: position.x,
      top: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPosition({
      x: Math.max(12, drag.current.left + event.clientX - drag.current.x),
      y: Math.max(12, drag.current.top + event.clientY - drag.current.y),
    });
  }

  function endDrag() {
    drag.current = null;
  }

  return (
    <>
      <section className="panel">
        <div className="result-panel-header">
          <h2>筛选结果</h2>
          <div className="result-actions">
            <label className="chart-source-toggle">
              <input
                type="checkbox"
                checked={use10jqka}
                onChange={(event) => setUse10jqka(event.target.checked)}
              />
              使用同花顺 K 线
            </label>
            <button
              onClick={() =>
                window.location.assign(
                  `/api/screening-runs/${result.run.id}/export`,
                )
              }
            >
              导出 EBK
            </button>
          </div>
        </div>
        <p>
          模式：{result.run.mode === "post_close" ? "盘后" : "盘中"}；数据截至：
          {result.run.dataAsOf}；
          {result.run.mode !== "post_close" && (
            <>盘中快照拉取时间：{result.snapshotCapturedAt
              ? new Intl.DateTimeFormat("zh-CN", {
                  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
                  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
                }).format(new Date(result.snapshotCapturedAt))
              : "暂无当天快照"}；</>
          )}
          命中 {result.run.matchedCount} 只，不可用 {result.run.unavailableCount} 只
        </p>
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>状态</th>
              <th>当前价（前复权）</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((row) => {
              const detail = formatDetail(row.detail);
              return (
                <tr key={row.stockCode}>
                  <td>{row.stockCode}</td>
                  <td>
                    <button
                      className="stock-link"
                      onClick={() => {
                        if (use10jqka) {
                          window.open(
                            `https://stockpage.10jqka.com.cn/${row.stockCode}/`,
                            "_blank",
                            "noopener,noreferrer",
                          );
                          return;
                        }
                        setStock({ code: row.stockCode, name: row.name });
                      }}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${row.status}`}>{row.status}</span>
                  </td>
                  <td>{row.currentPrice?.toFixed(2) ?? "-"}</td>
                  <td title={detail}>{shortDetail(detail)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {stock && (
        <section
          className="chart-window"
          style={{ left: position.x, top: position.y }}
        >
          <div
            className="chart-window-header"
            onPointerDown={beginDrag}
            onPointerMove={dragMove}
            onPointerUp={endDrag}
          >
            <div className="chart-stock-summary">
              <h2>
                {stock.name} · {stock.code}
              </h2>
              {quote && (
                <p
                  className={
                    quote.changePercent > 0
                      ? "positive"
                      : quote.changePercent < 0
                        ? "negative"
                        : "flat"
                  }
                >
                  {quote.price.toFixed(2)}{" "}
                  {quote.changePercent < 0 ? "↓" : "↑"}{" "}
                  {quote.changePercent > 0 ? "+" : ""}
                  {quote.changePercent.toFixed(2)}%
                </p>
              )}
            </div>
            <div
              className="chart-window-actions"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                className="open-external"
                onClick={() =>
                  window.open(f10Url, "_blank", "noopener,noreferrer")
                }
              >
                F10
              </button>
              <button
                className="open-external"
                onClick={() =>
                  window.open(url, "_blank", "noopener,noreferrer")
                }
              >
                同花顺打开
              </button>
              <button
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setStock(null)}
              >
                关闭
              </button>
            </div>
          </div>
          <div className="chart-window-body">
            <LocalKline code={stock.code} onQuote={setQuote} />
            <div className="chart-navigation">
              <button
                disabled={stockIndex <= 0}
                onClick={() => {
                  const previous = result.results[stockIndex - 1];
                  if (previous) {
                    setStock({ code: previous.stockCode, name: previous.name });
                  }
                }}
              >
                上一个
              </button>
              <button
                disabled={
                  stockIndex < 0 || stockIndex >= result.results.length - 1
                }
                onClick={() => {
                  const next = result.results[stockIndex + 1];
                  if (next) setStock({ code: next.stockCode, name: next.name });
                }}
              >
                下一个
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function formatDetail(detail: string): string {
  try {
    const data = JSON.parse(detail) as {
      reason?: string;
      conditions?: Array<{ message: string }>;
    };
    return (
      data.reason ??
      data.conditions?.map((item) => item.message).join("；") ??
      "-"
    );
  } catch {
    return "-";
  }
}

function shortDetail(detail: string) {
  return detail.length > 18 ? `${detail.slice(0, 18)}...` : detail;
}

function LocalKline({
  code,
  onQuote,
}: {
  code: string;
  onQuote: (quote: { price: number; changePercent: number } | null) => void;
}) {
  const [bars, setBars] = useState<StockBar[] | null>(null);
  const [stockInfo, setStockInfo] = useState<
    | { reason: string | null; industry: string | null }
    | undefined
  >(undefined);
  const [viewport, setViewport] = useState({ start: 0, count: 90 });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef(viewport);
  const panRef = useRef<{ x: number; start: number } | null>(null);
  viewportRef.current = viewport;

  useEffect(() => {
    setBars(null);
    setSelectedDate(null);
    void fetch(`/api/stocks/${code}?days=90`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const nextBars: StockBar[] = data?.bars ? [...data.bars].reverse() : [];
        if (data?.intradayBar) nextBars.push(data.intradayBar as StockBar);
        const latest = nextBars.at(-1);
        if (
          latest?.rawClose !== null &&
          latest?.rawClose !== undefined &&
          latest.preClose !== null &&
          latest.preClose !== undefined &&
          latest.preClose > 0
        ) {
          onQuote({
            price: latest.rawClose,
            changePercent: ((latest.rawClose / latest.preClose) - 1) * 100,
          });
        } else {
          onQuote(null);
        }
        setBars(nextBars);
        setViewport({ start: 0, count: nextBars.length || 90 });
      });
  }, [code]);

  useEffect(() => {
    setStockInfo(undefined);
    void fetch(`/api/stocks/${code}/limit-up-reason`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) =>
        setStockInfo({
          reason: data?.reason ?? null,
          industry: data?.industry ?? null,
        }),
      )
      .catch(() => setStockInfo({ reason: null, industry: null }));
  }, [code]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !bars?.length) return;
    const zoomByWheel = (event: WheelEvent) => {
      event.preventDefault();
      const currentCount = Math.min(viewportRef.current.count, bars.length);
      const minimumCount = Math.min(15, bars.length);
      const nextCount = Math.max(
        minimumCount,
        Math.min(
          bars.length,
          Math.round(currentCount * (event.deltaY < 0 ? 0.8 : 1.25)),
        ),
      );
      if (nextCount === currentCount) return;
      setViewport({ start: bars.length - nextCount, count: nextCount });
    };
    svg.addEventListener("wheel", zoomByWheel, { passive: false });
    return () => svg.removeEventListener("wheel", zoomByWheel);
  }, [bars]);

  if (bars === null) return <p className="muted">正在加载本地日线数据…</p>;
  if (!bars.length) return <p className="muted">没有可用日线数据。</p>;

  const visibleCount = Math.min(viewport.count, bars.length);
  const visibleStart = Math.max(
    0,
    Math.min(viewport.start, bars.length - visibleCount),
  );
  const visibleBars = bars.slice(visibleStart, visibleStart + visibleCount);
  const width = 740,
    height = 520,
    top = 48,
    chartBottom = 390,
    volumeTop = 415,
    volumeBottom = 495,
    step = width / visibleBars.length;
  const selectedIndex = visibleBars.findIndex((bar) => bar.tradeDate === selectedDate);
  const selectedX = (selectedIndex + 0.5) * step;
  const labelWidth = 190;
  const labelX = Math.max(2, Math.min(width - labelWidth - 2, selectedX - labelWidth / 2));
  const selectDate = (event: React.MouseEvent<SVGSVGElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    // 使用 SVG 坐标变换，兼容等比缩放产生的留白。
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (point.x < 0 || point.x > width || point.y < top || point.y > volumeBottom) return;
    const index = Math.min(visibleBars.length - 1, Math.floor(point.x / step));
    setSelectedDate(visibleBars[index].tradeDate);
  };
  const values = visibleBars.flatMap((bar) => [
    bar.lowQfq,
    bar.highQfq,
    bar.ma5 ?? bar.closeQfq,
    bar.ma10 ?? bar.closeQfq,
    bar.ma60 ?? bar.closeQfq,
    bar.dkx ?? bar.closeQfq,
  ]);
  const low = Math.min(...values),
    high = Math.max(...values),
    range = high - low || 1,
    y = (value: number) => top + ((high - value) / range) * (chartBottom - top);
  const maxVolume = Math.max(...visibleBars.map((bar) => bar.volume), 1);
  const latest = visibleBars.at(-1)!;
  const line = (key: keyof StockBar) => {
    let started = false;
    return visibleBars
      .map((bar, index) => {
        if (bar[key] === null) return "";
        const command = started ? "L" : "M";
        started = true;
        return `${command}${(index + 0.5) * step} ${y(Number(bar[key]))}`;
      })
      .join(" ");
  };

  const beginPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    panRef.current = { x: event.clientX, start: visibleStart };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (selectedDate !== null) selectDate(event);
    if (!panRef.current) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    const offset = Math.round(
      ((panRef.current.x - event.clientX) / width) * visibleBars.length,
    );
    const nextStart = Math.max(
      0,
      Math.min(panRef.current.start + offset, bars.length - visibleBars.length),
    );
    setViewport({ start: nextStart, count: visibleBars.length });
  };
  const endPan = (event: React.PointerEvent<SVGSVGElement>) => {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <>
      <p className="limit-up-reason">
        {stockInfo === undefined
          ? "正在查询行业和最近涨停原因…"
          : `行业：${stockInfo.industry ?? "暂无"}　最近涨停原因：${stockInfo.reason ?? "暂无"}`}
      </p>
      <svg
      ref={svgRef}
      className="local-kline"
      style={selectedDate !== null ? { cursor: 'url("/cursors/small-crosshair.svg") 8 8, crosshair' } : undefined}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDoubleClick={(event) => {
        if (selectedDate !== null) {
          setSelectedDate(null);
        } else {
          selectDate(event);
        }
      }}
    >
      <rect width={width} height={height} fill="#fff" />
      {[0, 0.25, 0.5, 0.75, 1].map((rate) => (
        <line
          key={rate}
          x1="0"
          x2={width}
          y1={top + rate * (chartBottom - top)}
          y2={top + rate * (chartBottom - top)}
          stroke="#e8eef5"
        />
      ))}
      {visibleBars.map((bar, index) => {
        const x = (index + 0.5) * step,
          up = bar.closeQfq >= bar.openQfq,
          limitRatio =
            code.startsWith("30") || code.startsWith("68")
              ? 0.2
              : code.startsWith("4") || code.startsWith("8")
                ? 0.3
                : 0.1,
          preCloseCents =
            bar.preClose === null ? null : Math.round(bar.preClose * 100),
          limitPriceCents =
            preCloseCents === null
              ? null
              : Math.round(preCloseCents * (1 + limitRatio)),
          limitUp =
            limitPriceCents !== null &&
            bar.rawClose !== null &&
            Math.round(bar.rawClose * 100) >= limitPriceCents,
          limitDownPriceCents =
            preCloseCents === null
              ? null
              : Math.round(preCloseCents * (1 - limitRatio)),
          limitDown =
            limitDownPriceCents !== null &&
            bar.rawClose !== null &&
            Math.round(bar.rawClose * 100) <= limitDownPriceCents,
          candleColor = limitUp
            ? "#8b5cf6"
            : limitDown
              ? "#000"
              : up
                ? "#ef3340"
                : "#16803c",
          bodyTop = y(Math.max(bar.openQfq, bar.closeQfq)),
          bodyHeight = Math.max(1, Math.abs(y(bar.openQfq) - y(bar.closeQfq)));
        return (
          <g key={bar.tradeDate}>
            <line
              x1={x}
              x2={x}
              y1={y(bar.highQfq)}
              y2={y(bar.lowQfq)}
              stroke={candleColor}
            />
            <rect
              x={x - step * 0.3}
              y={bodyTop}
              width={Math.max(1, step * 0.6)}
              height={bodyHeight}
              fill={up && !limitDown ? "#fff" : candleColor}
              stroke={candleColor}
            />
            <rect
              x={x - step * 0.3}
              y={
                volumeBottom -
                (bar.volume / maxVolume) * (volumeBottom - volumeTop)
              }
              width={Math.max(1, step * 0.6)}
              height={(bar.volume / maxVolume) * (volumeBottom - volumeTop)}
              fill={candleColor}
            />
          </g>
        );
      })}
      <path d={line("ma5")} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
      <path d={line("ma10")} fill="none" stroke="#a855f7" strokeWidth="1.5" />
      <path d={line("ma60")} fill="none" stroke="#2563eb" strokeWidth="1.5" />
      <path d={line("dkx")} fill="none" stroke="#000" strokeWidth="1.5" />
      <text x="8" y="28" fill="#f59e0b" fontSize="20">
        MA5 {latest.ma5?.toFixed(2) ?? "-"}
      </text>
      <text x="143" y="28" fill="#a855f7" fontSize="20">
        MA10 {latest.ma10?.toFixed(2) ?? "-"}
      </text>
      <text x="278" y="28" fill="#2563eb" fontSize="20">
        MA60 {latest.ma60?.toFixed(2) ?? "-"}
      </text>
      <text x="413" y="28" fill="#000" fontSize="20">
        DKX {latest.dkx?.toFixed(2) ?? "-"}
      </text>
      {selectedIndex >= 0 && selectedDate && (
        <g pointerEvents="none">
          <line
            x1={selectedX} x2={selectedX}
            y1={top} y2={volumeBottom}
            stroke="#333" strokeDasharray="5 5"
          />
          <text x={labelX + labelWidth / 2} y={514} textAnchor="middle" fill="#000" fontSize={16}>
            {selectedDate} {new Intl.DateTimeFormat("zh-CN", { weekday: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T00:00:00Z`))}
          </text>
        </g>
      )}
      </svg>
    </>
  );
}
