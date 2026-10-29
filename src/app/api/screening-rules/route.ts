import { NextResponse } from "next/server";

import { getScreeningPresets } from "@/server/screening-presets";
import { listUserCollections } from "@/server/user-collections";
import { usernameFromRequest } from "@/server/username";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const username = usernameFromRequest(request);
  if (!username) return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  return NextResponse.json({ presets: getScreeningPresets(), collections: await listUserCollections(username) });
}
