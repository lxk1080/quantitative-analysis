"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { CustomEditor } from "./components/custom-editor";
import { RuleSelector } from "./components/rule-selector";
import { ScreeningResults } from "./components/screening-results";
import { UsernameGate, useUsername } from "./components/username-gate";
import { Metric, Progress } from "./components/status-widgets";
import {
  buildCustomDefinition,
  customSummary,
  directCustomChoice,
  emptyStatus,
  initialCustom,
} from "./lib/custom-conditions";
import type {
  CustomConfig,
  Job,
  Preset,
  RuleChoice,
  ScreeningResult,
  Status,
} from "./lib/types";

export default function HomePage() {
  const { username, loaded: usernameLoaded, save: saveUsername } = useUsername();
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [message, setMessage] = useState("正在加载数据概览…");
  const [busy, setBusy] = useState(false);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [useExistingRealtime, setUseExistingRealtime] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [resultRuleTitle, setResultRuleTitle] = useState("");
  const [choices, setChoices] = useState<RuleChoice[]>([]);
  const [selected, setSelected] = useState<RuleChoice | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [custom, setCustom] = useState<CustomConfig>(initialCustom);
  const [customDraft, setCustomDraft] = useState<CustomConfig>(initialCustom);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null,
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) return false;
      setStatus((await response.json()) as Status);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadChoices = useCallback(async () => {
    if (!username) return;
    try {
      const response = await fetch("/api/screening-rules", {
        cache: "no-store",
        headers: { "x-quant-username": username },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        presets: Preset[];
        collections: Array<{ id: string; title: string; config: CustomConfig }>;
      };
      const next: RuleChoice[] = [
        ...payload.presets
          .filter((item) => item.id !== "custom-rule")
          .map((item) => ({ ...item, category: "preset" as const })),
        ...payload.collections.map((item) => ({
          id: item.id,
          title: item.title,
          description: customSummary(item.config),
          category: "custom" as const,
          config: item.config,
        })),
      ];
      setChoices(next);
      setSelected((current) => {
        if (!current)
          return (
            next.find((item) => item.id === "n-pattern-rule") ?? next[0] ?? null
          );
        if (current.id === "custom-rule") return current;
        return (
          next.find((item) => item.id === current.id) ??
          next.find((item) => item.id === "n-pattern-rule") ??
          next[0] ??
          null
        );
      });
    } catch {
      setChoices([]);
    }
  }, [username]);

  useEffect(() => {
    void refresh().then((loaded) =>
      setMessage(
        loaded ? "数据概览已加载！" : "数据概览加载失败，请刷新页面重试。",
      ),
    );
  }, [refresh]);

  useEffect(() => { if (username) void loadChoices(); }, [username, loadChoices]);

  useLayoutEffect(() => {
    const button = document.querySelector<HTMLButtonElement>(
      ".action-toolbar > .primary",
    );
    const header = document.querySelector<HTMLElement>(".rule-panel-header");
    if (button && header && button.parentElement !== header) {
      header.append(button);
    }
  }, []);

  const customDefinition = useMemo(
    () => buildCustomDefinition(custom),
    [custom],
  );
  const progress =
    job && job.progressTotal > 0
      ? Math.min(
          100,
          Math.round((job.progressCurrent / job.progressTotal) * 100),
        )
      : null;

  async function waitForJob(jobId: string): Promise<Job | null> {
    for (let attempt = 0; attempt < 7200; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!response.ok) return null;
      const next = (await response.json()) as Job;
      setJob(next);
      if (next.status === "succeeded" || next.status === "failed") return next;
    }
    return null;
  }

  async function startSync() {
    setBusy(true);
    setResult(null);
    setJob({ status: "queued", progressCurrent: 0, progressTotal: 0 });
    setMessage("正在提交同步任务…");
    const response = await fetch("/api/jobs/daily-sync", { method: "POST" });
    const payload = (await response.json()) as {
      error?: string;
      reused?: boolean;
      jobId: string;
    };
    if (!response.ok) {
      setBusy(false);
      setJob(null);
      setMessage(payload.error ?? "创建同步任务失败");
      return;
    }
    setMessage(
      payload.reused
        ? "已有同步任务正在执行，已接入该任务进度。"
        : "正在检查本地最近 90 个交易日数据；仅缺失时才补齐。",
    );
    const finished = await waitForJob(payload.jobId);
    setBusy(false);
    await refresh();
    if (!finished) {
      setMessage("任务仍在后台执行，可稍后刷新页面查看状态。");
    } else if (finished.status === "failed") {
      setMessage(`同步失败：${finished.error ?? "未知错误"}`);
    } else {
      setMessage(`同步完成：${summarize(finished.summary)}`);
    }
  }

  async function runScreening() {
    if (
      !username ||
      !selected ||
      (selected.id === "custom-rule" &&
        customDefinition.conditions.length === 0)
    )
      return;
    setBusy(true);
    setScreeningLoading(true);
    setResult(null);
    setResultRuleTitle(selected.title);
    setJob({ status: "queued", progressCurrent: 0, progressTotal: 0 });
    setMessage(`正在按“${selected.title}”筛选…`);
    const response = await fetch("/api/screening-runs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-quant-username": username },
      body: JSON.stringify({
        ruleId: selected.id,
        mode: "intraday",
        useExistingRealtime,
        definition:
          selected.id === "custom-rule" ? customDefinition : undefined,
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      jobId: string;
    };
    if (!response.ok) {
      setBusy(false);
      setScreeningLoading(false);
      setJob(null);
      setMessage(payload.error ?? "创建筛选任务失败");
      return;
    }
    const finished = await waitForJob(payload.jobId);
    setBusy(false);
    await refresh();
    if (!finished) {
      setScreeningLoading(false);
      setMessage("任务仍在后台执行，可稍后刷新页面查看状态。");
      return;
    }
    if (finished.status === "failed") {
      setScreeningLoading(false);
      setMessage(`筛选失败：${finished.error ?? "未知错误"}`);
      return;
    }
    const summary = JSON.parse(finished.summary ?? "{}") as { run_id?: string };
    if (!summary.run_id) {
      setScreeningLoading(false);
      setMessage("筛选完成，但未返回结果标识。");
      return;
    }
    const resultResponse = await fetch(
      `/api/screening-runs/${summary.run_id}`,
      { cache: "no-store" },
    );
    if (resultResponse.ok) {
      setResult((await resultResponse.json()) as ScreeningResult);
    }
    setScreeningLoading(false);
    setMessage("筛选完成。");
  }

  function chooseRule(choice: RuleChoice) {
    setSelected(choice);
    if (choice.category === "custom" && choice.config) setCustom(choice.config);
    setSelectorOpen(false);
  }

  function openNewCustom() {
    const next = { ...initialCustom };
    setCustomDraft(next);
    setEditingCollectionId(null);
    setCustomEditorOpen(true);
  }

  function openEditCustom(choice: RuleChoice) {
    if (!choice.config) return;
    setCustomDraft({ ...choice.config });
    setEditingCollectionId(choice.id);
    setCustomEditorOpen(true);
  }

  async function saveCollection(title: string): Promise<boolean> {
    if (!username) return false;
    const name = title.trim();
    if (!name) return false;
    const response = await fetch(
      editingCollectionId
        ? `/api/custom-rules/${editingCollectionId}`
        : "/api/custom-rules",
      {
        method: editingCollectionId ? "PUT" : "POST",
        headers: { "content-type": "application/json", "x-quant-username": username },
        body: JSON.stringify({ config: customDraft, title: name }),
      },
    );
    if (!response.ok) {
      setMessage("收藏保存失败，请重试。");
      return false;
    }
    // 收藏保存一份副本；只有从列表点击编辑才进入编辑模式。
    await loadChoices();
    return true;
  }

  async function confirmCustom(): Promise<boolean> {
    if (editingCollectionId) {
      if (!username) return false;
      const response = await fetch(`/api/custom-rules/${editingCollectionId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-quant-username": username },
        body: JSON.stringify({ config: customDraft }),
      });
      if (!response.ok) {
        setMessage("自定义条件保存失败，请重试。");
        return false;
      }
      const saved = (await response.json()) as {
        id: string;
        title: string;
        config: CustomConfig;
      };
      setSelected((current) =>
        current?.id === saved.id
          ? {
              id: saved.id,
              title: saved.title,
              description: customSummary(saved.config),
              category: "custom",
              config: saved.config,
            }
          : current,
      );
      await loadChoices();
    } else {
      setCustom(customDraft);
      setSelected(directCustomChoice(customDraft));
    }
    return true;
  }

  async function deleteCollection(choice: RuleChoice): Promise<boolean> {
    if (!username) return false;
    const response = await fetch(`/api/custom-rules/${choice.id}`, {
      method: "DELETE",
      headers: { "x-quant-username": username },
    });
    if (!response.ok) {
      setMessage("删除失败，请重试。");
      return false;
    }
    setSelected((current) => (current?.id === choice.id ? null : current));
    await loadChoices();
    return true;
  }

  return (
    <main className="shell">
      <header>
        <h1 className="home-title">量化分析</h1>
      </header>
      <section className="notice">
        <strong>数据策略：</strong>数据库日线只以 Tushare 为准；16:00 前仅使用
        AKShare 临时快照，不写入数据库。
      </section>
      <section className="grid metrics">
        <Metric
          label="非 ST 股票池"
          value={status.ready ? String(status.securities) : "未就绪"}
        />
        <Metric
          label="有效日线"
          value={status.ready ? String(status.dailyBars) : "-"}
        />
        <Metric label="最近交易日" value={status.latestTradeDate ?? "-"} />
        <Metric label="待处理任务" value={String(status.pendingJobs)} />
      </section>
      <section className="buttons action-toolbar">
        <Link className="button-link" href="/stocks">
          浏览股票数据
        </Link>
        <button onClick={startSync} disabled={busy}>
          同步历史与今日数据
        </button>
        <Link className="button-link history-watchlist-link" href="/watchlists">历史自选记录</Link>
        <button
          className="primary"
          onClick={runScreening}
          disabled={
            busy ||
            !selected ||
            (selected.id === "custom-rule" &&
              customDefinition.conditions.length === 0)
          }
        >
          运行筛选
        </button>
      </section>
      <section className="panel">
        <h2>数据与任务</h2>
        <p>{message}</p>
        {job && <Progress job={job} progress={progress} />}
      </section>
      <section className="panel rule-panel">
        <div className="rule-panel-header rule-panel-title-row">
          <h2>筛选条件</h2>
          <div className="rule-actions">
            <button onClick={() => setSelectorOpen(true)} disabled={busy}>
              选择筛选条件
            </button>
            <button onClick={openNewCustom} disabled={busy}>
              自定义条件
            </button>
          </div>
          <label className="chart-source-toggle existing-realtime-toggle">
            <input
              type="checkbox"
              checked={useExistingRealtime}
              onChange={(event) => setUseExistingRealtime(event.target.checked)}
              disabled={busy}
            />
            使用已有的实时数据
          </label>
        </div>
        {selected ? (
          <div className="selected-rule">
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
          </div>
        ) : (
          <p className="muted">正在加载可用筛选条件…</p>
        )}
      </section>
      {screeningLoading && (
        <div className="screening-loading" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>正在筛选…</span>
        </div>
      )}
      {result && username && <ScreeningResults result={result} username={username} ruleTitle={resultRuleTitle} />}
      {usernameLoaded && !username && <UsernameGate onSave={saveUsername} />}
      {selectorOpen && (
        <RuleSelector
          choices={choices}
          selectedId={selected?.id ?? null}
          onClose={() => setSelectorOpen(false)}
          onChoose={chooseRule}
          onEdit={openEditCustom}
          onDelete={deleteCollection}
        />
      )}
      {customEditorOpen && (
        <CustomEditor
          value={customDraft}
          onChange={setCustomDraft}
          isEditing={Boolean(editingCollectionId)}
          onClose={() => setCustomEditorOpen(false)}
          onFavorite={saveCollection}
          onConfirm={confirmCustom}
        />
      )}
    </main>
  );
}

function summarize(summary: string | null | undefined) {
  try {
    const value = JSON.parse(summary ?? "{}") as Record<string, unknown>;
    return value.current ? String(value.current) : "任务已完成";
  } catch {
    return "任务已完成";
  }
}
