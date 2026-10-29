import { NextResponse } from "next/server";
import { z } from "zod";

import { createUserCollection, listUserCollections } from "@/server/user-collections";
import { usernameFromRequest } from "@/server/username";

export const runtime = "nodejs";
const requestSchema = z.object({ config: z.record(z.string(), z.unknown()), title: z.string().trim().min(1).max(40) });

export async function GET(request: Request) {
  const username = usernameFromRequest(request);
  if (!username) return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  return NextResponse.json({ collections: await listUserCollections(username) });
}
export async function POST(request: Request) {
  const username = usernameFromRequest(request);
  if (!username) return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "收藏条件无效" }, { status: 400 });
  return NextResponse.json(await createUserCollection(username, parsed.data.config, parsed.data.title), { status: 201 });
}
