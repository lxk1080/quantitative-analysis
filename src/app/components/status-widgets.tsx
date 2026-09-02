import type { Job } from "../lib/types";

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function Progress({
  job,
  progress,
}: {
  job: Job;
  progress: number | null;
}) {
  return (
    <div className="progress-wrap" aria-live="polite">
      <div className="progress-caption">
        <span>
          {job.status === "queued"
            ? "等待 Worker"
            : job.status === "running"
              ? "正在执行"
              : job.status === "succeeded"
                ? "已完成"
                : "失败"}
        </span>
        <span>
          {progress === null
            ? "准备中"
            : `${job.progressCurrent} / ${job.progressTotal}（${progress}%）`}
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-value"
          style={{ width: `${progress ?? 4}%` }}
        />
      </div>
    </div>
  );
}
