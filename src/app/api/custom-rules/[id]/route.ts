import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteUserCollection, updateUserCollection } from "@/server/user-collections";
import { usernameFromRequest } from "@/server/username";

export const runtime = "nodejs";
const requestSchema = z.object({ config: z.record(z.string(), z.unknown()), title: z.string().trim().min(1).max(40).optional() });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const username = usernameFromRequest(request);
  if (!username) return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "收藏条件无效" }, { status: 400 });
  const value = await updateUserCollection(username, (await params).id, parsed.data.config, parsed.data.title);
  return value ? NextResponse.json(value) : NextResponse.json({ error: "收藏不存在" }, { status: 404 });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const username = usernameFromRequest(request);
  if (!username) return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  return (await deleteUserCollection(username, (await params).id)) ? new Response(null, { status: 204 }) : NextResponse.json({ error: "收藏不存在" }, { status: 404 });
}
