import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { rawDb } from "@/db/client";
import { getDashboardStatus } from "@/server/dashboard";
import { launchWorkerOnce } from "@/server/worker-launcher";
import { collectionDefinition } from "@/server/custom-collections";
import { getUserCollection } from "@/server/user-collections";
import { usernameFromRequest } from "@/server/username";

const requestSchema = z.object({
  ruleId: z.string().min(1),
  mode: z.enum(["post_close", "intraday"]).default("post_close"),
  useExistingRealtime: z.boolean().default(false),
  definition: z.object({
    version: z.number().int().optional(),
    operator: z.literal("all"),
    conditions: z.array(z.object({ type: z.string().min(1) }).passthrough()).min(1),
  }).optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const username = usernameFromRequest(request);
  if (!username) return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "筛选参数无效" }, { status: 400 });
  const collection = parsed.data.ruleId.startsWith("custom-") && parsed.data.ruleId !== "custom-rule" ? await getUserCollection(username, parsed.data.ruleId) : null;
  if (parsed.data.ruleId.startsWith("custom-") && parsed.data.ruleId !== "custom-rule" && !collection) return NextResponse.json({ error: "收藏不存在" }, { status: 404 });
  const actualRuleId = collection ? "custom-rule" : parsed.data.ruleId;
  const actualDefinition = collection ? collectionDefinition(collection.config) : parsed.data.definition;
  if (actualRuleId === "custom-rule" && !actualDefinition && !collection) {
    return NextResponse.json({ error: "请至少启用一个自定义条件" }, { status: 400 });
  }
  if (!getDashboardStatus().ready) return NextResponse.json({ error: "请先初始化数据库" }, { status: 409 });
  const id = randomUUID();
  const now = new Date().toISOString();
  rawDb.prepare(
    "INSERT INTO sync_jobs(id, kind, payload_json, status, created_at) VALUES (?, 'screening', ?, 'queued', ?)",
  ).run(id, JSON.stringify({ rule_id: actualRuleId, rule_title: collection?.title, mode: parsed.data.mode, definition: actualDefinition, use_existing_realtime: parsed.data.useExistingRealtime }), now);
  launchWorkerOnce();
  return NextResponse.json({ jobId: id }, { status: 202 });
}
