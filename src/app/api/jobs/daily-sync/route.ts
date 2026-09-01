import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { rawDb } from "@/db/client";
import { launchWorkerOnce } from "@/server/worker-launcher";

export const runtime = "nodejs";

export function POST() {
  try {
    const ready = rawDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_jobs'").get();
    if (!ready) return NextResponse.json({ error: "请先执行数据库迁移" }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "无法读取任务数据库，请检查数据库迁移" }, { status: 503 });
  }
  // A second full-market sync should attach to the already-running job rather
  // than queue behind it and give the user the impression the click was lost.
  const active = rawDb.prepare(
    "SELECT id FROM sync_jobs WHERE kind='daily_sync' AND status IN ('queued', 'running') ORDER BY created_at LIMIT 1",
  ).get() as { id: string } | undefined;
  if (active) return NextResponse.json({ jobId: active.id, reused: true }, { status: 202 });

  const id = randomUUID();
  rawDb.prepare("INSERT INTO sync_jobs(id, kind, payload_json, status, created_at) VALUES (?, 'daily_sync', '{}', 'queued', ?)")
    .run(id, new Date().toISOString());
  launchWorkerOnce();
  return NextResponse.json({ jobId: id, reused: false }, { status: 202 });
}
