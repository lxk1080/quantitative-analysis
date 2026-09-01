import { NextResponse } from "next/server";

import { rawDb } from "@/db/client";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = rawDb.prepare(
    "SELECT id, kind, status, progress_current AS progressCurrent, progress_total AS progressTotal, summary_json AS summary, error_message AS error, created_at AS createdAt FROM sync_jobs WHERE id=?",
  ).get(id);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "任务不存在" }, { status: 404 });
}
