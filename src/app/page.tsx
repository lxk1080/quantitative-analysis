"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

type Status = {
  ready: boolean; securities: number; dailyBars: number; latestTradeDate: string | null;
  latestQuoteAt: string | null; pendingJobs: number;
  latestJob: { id: string; kind: string; status: string; createdAt: string; summary?: string | null } | null;
  defaultRuleId: string | null;
};
type Job = { status: "queued" | "running" | "succeeded" | "failed"; progressCurrent: number; progressTotal: number; summary?: string | null; error?: string | null };
type Preset = { id: string; title: string; description: string };
type ScreeningResult = { run: { id: string; matchedCount: number; unavailableCount: number; dataAsOf: string; mode: string }; results: Array<{ stockCode: string; name: string; status: string; currentPrice: number | null; detail: string }> };

const emptyStatus: Status = { ready: false, securities: 0, dailyBars: 0, latestTradeDate: null, latestQuoteAt: null, pendingJobs: 0, latestJob: null, defaultRuleId: null };

export default function HomePage() {
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [message, setMessage] = useState("正在加载数据概览…");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) return false;
      setStatus(await response.json() as Status);
      return true;
    } catch { return false; }
  }, []);

  const loadPresets = useCallback(async () => {
    try {
      const response = await fetch("/api/screening-rules", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { presets: Preset[] };
      setPresets(payload.presets);
      setSelectedRuleId((current) => current && payload.presets.some((preset) => preset.id === current) ? current : payload.presets[0]?.id ?? null);
    } catch { setPresets([]); }
  }, []);

  useEffect(() => {
    void refresh().then((loaded) => setMessage((current) => current === "正在加载数据概览…" ? (loaded ? "数据概览已加载。" : "数据概览加载失败，请刷新页面重试") : current));
    void loadPresets();
  }, [loadPresets, refresh]);

  const selectedPreset = useMemo(() => presets.find((preset) => preset.id === selectedRuleId) ?? null, [presets, selectedRuleId]);

  async function waitForJob(jobId: string): Promise<Job | null> {
    for (let attempt = 0; attempt < 7200; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!response.ok) return null;
      const next = await response.json() as Job;
      setJob(next);
      if (next.status === "succeeded" || next.status === "failed") return next;
    }
    return null;
  }

  async function startSync() {
    flushSync(() => { setBusy(true); setResult(null); setJob({ status: "queued", progressCurrent: 0, progressTotal: 0 }); setMessage("正在提交同步任务…"); });
    const response = await fetch("/api/jobs/daily-sync", { method: "POST" });
    const payload = await response.json() as { error?: string; reused?: boolean; jobId: string };
    if (!response.ok) { setBusy(false); setJob(null); setMessage(payload.error ?? "创建同步任务失败"); return; }
    setMessage(payload.reused ? "已有同步任务正在执行，已接入该任务的进度。" : "正在检查本地最近 90 个交易日是否完整；仅缺失时才请求 Tushare。");
    const finished = await waitForJob(payload.jobId);
    setBusy(false); await refresh();
    if (!finished) setMessage("任务仍在后台执行，可稍后刷新页面查看状态。");
    else if (finished.status === "failed") setMessage(`同步失败：${finished.error ?? "未知错误"}`);
    else setMessage(`同步完成：${summarize(finished.summary)}`);
  }

  async function runScreening() {
    if (!selectedPreset) return;
    flushSync(() => { setBusy(true); setResult(null); setJob({ status: "queued", progressCurrent: 0, progressTotal: 0 }); setMessage(`正在按“${selectedPreset.title}”筛选；会先检查本地 90 个交易日数据。`); });
    const response = await fetch("/api/screening-runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ruleId: selectedPreset.id, mode: "intraday" }) });
    const payload = await response.json() as { error?: string; jobId: string };
    if (!response.ok) { setBusy(false); setJob(null); setMessage(payload.error ?? "创建筛选任务失败"); return; }
    const finished = await waitForJob(payload.jobId);
    setBusy(false); await refresh();
    if (!finished) { setMessage("任务仍在后台执行，可稍后刷新页面查看状态。"); return; }
    if (finished.status === "failed") { setMessage(`筛选失败：${finished.error ?? "未知错误"}`); return; }
    const summary = JSON.parse(finished.summary ?? "{}") as { run_id?: string };
    if (!summary.run_id) { setMessage("筛选完成，但未返回结果标识。"); return; }
    const resultResponse = await fetch(`/api/screening-runs/${summary.run_id}`, { cache: "no-store" });
    if (resultResponse.ok) setResult(await resultResponse.json() as ScreeningResult);
    setMessage("筛选完成。");
  }

  function exportEbk() {
    if (result) window.location.assign(`/api/screening-runs/${result.run.id}/export`);
  }

  const progress = job && job.progressTotal > 0 ? Math.min(100, Math.round(job.progressCurrent / job.progressTotal * 100)) : null;
  return <main className="shell">
    <header><h1 className="home-title">量化分析</h1></header>
    <section className="notice"><strong>数据策略：</strong>数据库日线只以 Tushare 为准：16:00 后缺失的当日日线由 Tushare 补齐。16:00 前只使用 AKShare 临时快照：15:00 前缓存 5 分钟，15:00–16:00 冻结收盘快照；AKShare 数据只存 <code>caches/</code>，不写入数据库。</section>
    <section className="grid metrics"><Metric label="非 ST 股票池" value={status.ready ? String(status.securities) : "未就绪"} /><Metric label="有效日线" value={status.ready ? String(status.dailyBars) : "—"} /><Metric label="最近交易日" value={status.latestTradeDate ?? "—"} /><Metric label="待处理任务" value={String(status.pendingJobs)} /></section>
    <section className="buttons action-toolbar"><Link className="button-link" href="/stocks">浏览股票数据</Link><button onClick={startSync} disabled={busy}>同步历史与今日数据</button><button className="primary" onClick={runScreening} disabled={busy || !selectedPreset}>运行筛选（自动判断盘中/盘后）</button></section>
    <section className="panel"><h2>数据与任务</h2><p>{message}</p>{job && <div className="progress-wrap" aria-live="polite"><div className="progress-caption"><span>{job.status === "queued" ? "等待 Worker" : job.status === "running" ? "正在执行" : job.status === "succeeded" ? "已完成" : "失败"}</span><span>{progress === null ? "准备中" : `${job.progressCurrent} / ${job.progressTotal}（${progress}%）`}</span></div><div className="progress-track"><div className="progress-value" style={{ width: `${progress ?? 4}%` }} /></div></div>}</section>
    <section className="panel rule-panel"><div className="rule-panel-header rule-panel-title-row"><h2>筛选条件</h2><button onClick={() => setSelectorOpen(true)} disabled={busy || presets.length === 0}>选择筛选条件</button></div>{selectedPreset ? <div className="selected-rule"><h3>{selectedPreset.title}</h3><p>{selectedPreset.description}</p></div> : <p className="muted">正在加载可用筛选条件…</p>}</section>
    {result && <section className="panel"><div className="result-panel-header"><h2>筛选结果</h2><div className="result-actions"><button onClick={exportEbk}>导出 EBK</button></div></div><p>模式：{result.run.mode === "post_close" ? "盘后" : "盘中"}；数据截至：{result.run.dataAsOf}；命中 {result.run.matchedCount} 只，不可用 {result.run.unavailableCount} 只。</p><table><thead><tr><th>代码</th><th>名称</th><th>状态</th><th>当前价（前复权）</th><th>说明</th></tr></thead><tbody>{result.results.map((row) => <tr key={row.stockCode}><td>{row.stockCode}</td><td>{row.name}</td><td><span className={`badge ${row.status}`}>{row.status}</span></td><td>{row.currentPrice?.toFixed(2) ?? "—"}</td><td>{formatDetail(row.detail)}</td></tr>)}</tbody></table></section>}
    {selectorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectorOpen(false)}><section className="rule-modal" role="dialog" aria-modal="true" aria-labelledby="rule-selector-title" onMouseDown={(event) => event.stopPropagation()}><div className="rule-panel-header"><h2 id="rule-selector-title">选择筛选条件</h2><button className="modal-close" onClick={() => setSelectorOpen(false)} aria-label="关闭">×</button></div><div className="preset-list">{presets.map((preset) => <button className={`preset-option ${preset.id === selectedRuleId ? "selected" : ""}`} key={preset.id} onClick={() => { setSelectedRuleId(preset.id); setSelectorOpen(false); }}><strong>{preset.title}</strong><span>{preset.description}</span></button>)}</div></section></div>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><span>{label}</span><strong>{value}</strong></article>; }
function summarize(summary: string | null | undefined) { try { const value = JSON.parse(summary ?? "{}") as Record<string, unknown>; const parts: string[] = []; if (value.universe !== undefined) parts.push(`非 ST 股票池：${value.universe} 只`); if (value.known_dates !== undefined) parts.push(`此前已同步交易日：${value.known_dates} 个`); if (value.downloaded_dates !== undefined) parts.push(`本次补齐交易日：${value.downloaded_dates} 个`); if (value.raw_rows !== undefined) parts.push(`写入原始日线：${value.raw_rows} 条`); if (value.rebuilt !== undefined) parts.push(`已重建指标股票：${value.rebuilt} 只`); if (value.current !== undefined) parts.push(String(value.current)); return parts.join("；") || "任务已完成"; } catch { return "任务已完成"; } }
function formatDetail(detail: string): string { try { const data = JSON.parse(detail) as { reason?: string; conditions?: Array<{ message: string }> }; return data.reason ?? data.conditions?.map((item) => item.message).join("；") ?? "—"; } catch { return "—"; } }
