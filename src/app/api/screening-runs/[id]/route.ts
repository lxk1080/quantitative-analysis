import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { getRun } from "@/server/dashboard";

export const runtime = "nodejs";

async function latestSnapshotTime(): Promise<string | null> {
  const directory = path.join(process.cwd(), "caches");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });
  try {
    const names = (await fs.readdir(directory))
      .filter((name) => /^realtime-snapshot-\d{8}-\d{6}\.json$/.test(name))
      .sort().reverse();
    for (const name of names) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
        const captured = new Date(data.captured_at);
        if (Number.isFinite(captured.getTime()) && today.format(captured) === today.format(new Date())) {
          return captured.toISOString();
        }
      } catch { continue; }
    }
  } catch { return null; }
  return null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = getRun(id);
  return result ? NextResponse.json({ ...result, snapshotCapturedAt: await latestSnapshotTime() }) : NextResponse.json({ error: "筛选结果不存在" }, { status: 404 });
}
