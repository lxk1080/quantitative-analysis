import { NextResponse } from "next/server";
import { z } from "zod";

import { createCustomCollection, listCustomCollections } from "@/server/custom-collections";

export const runtime = "nodejs";
const requestSchema = z.object({ config: z.record(z.string(), z.unknown()), title: z.string().trim().min(1).max(40) });

export async function GET() { return NextResponse.json({ collections: await listCustomCollections() }); }
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "收藏条件无效" }, { status: 400 });
  return NextResponse.json(await createCustomCollection(parsed.data.config, parsed.data.title), { status: 201 });
}
