import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { rawDb } from "@/db/client";
import { getDashboardStatus } from "@/server/dashboard";
import { launchWorkerOnce } from "@/server/worker-launcher";

export const runtime = "nodejs";

export function POST() {
  if (!getDashboardStatus().ready) return NextResponse.json({ error: "请先同步真实日线，建立非 ST 股票池" }, { status: 409 });
  const id = randomUUID();
  rawDb.prepare("INSERT INTO sync_jobs(id, kind, payload_json, status, created_at) VALUES (?, 'realtime_sync', '{}', 'queued', ?)")
    .run(id, new Date().toISOString());
  launchWorkerOnce();
  return NextResponse.json({ jobId: id }, { status: 202 });
}
