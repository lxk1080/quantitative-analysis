import { NextResponse } from "next/server";
import { deleteWatchlistStock } from "@/server/watchlists";
import { usernameFromRequest } from "@/server/username";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ date: string; code: string }> },
) {
  const username = usernameFromRequest(request);
  if (!username)
    return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  const { date, code } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{6}$/.test(code))
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  return deleteWatchlistStock(username, date, code)
    ? new Response(null, { status: 204 })
    : NextResponse.json({ error: "股票不存在" }, { status: 404 });
}
