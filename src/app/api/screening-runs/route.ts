import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { rawDb } from "@/db/client";
import { getDashboardStatus } from "@/server/dashboard";
import { launchWorkerOnce } from "@/server/worker-launcher";

const requestSchema = z.object({
  ruleId: z.string().min(1),
  mode: z.enum(["post_close", "intraday"]).default("post_close"),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "筛选参数无效" }, { status: 400 });
  if (!getDashboardStatus().ready) return NextResponse.json({ error: "请先初始化数据库" }, { status: 409 });
  const id = randomUUID();
  const now = new Date().toISOString();
  rawDb.prepare(
    "INSERT INTO sync_jobs(id, kind, payload_json, status, created_at) VALUES (?, 'screening', ?, 'queued', ?)",
  ).run(id, JSON.stringify({ rule_id: parsed.data.ruleId, mode: parsed.data.mode }), now);
  launchWorkerOnce();
  return NextResponse.json({ jobId: id }, { status: 202 });
}
