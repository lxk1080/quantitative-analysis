import { NextResponse } from "next/server";

import { getRun } from "@/server/dashboard";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = getRun(id);
  return result ? NextResponse.json(result) : NextResponse.json({ error: "筛选结果不存在" }, { status: 404 });
}
