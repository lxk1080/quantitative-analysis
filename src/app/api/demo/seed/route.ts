import { NextResponse } from "next/server";

import { launchDemoSeed } from "@/server/worker-launcher";

export const runtime = "nodejs";

export async function POST() {
  try {
    await launchDemoSeed();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "演示数据初始化失败" }, { status: 500 });
  }
}
