import { NextResponse } from "next/server";
import { deleteWatchlistDay, getWatchlistDay } from "@/server/watchlists";
import { usernameFromRequest } from "@/server/username";

export const runtime = "nodejs";
type Context = { params: Promise<{ date: string }> };
function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export async function GET(request: Request, { params }: Context) {
  const username = usernameFromRequest(request);
  if (!username)
    return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  const { date } = await params;
  if (!validDate(date))
    return NextResponse.json({ error: "日期无效" }, { status: 400 });
  const stocks = getWatchlistDay(username, date);
  return stocks
    ? NextResponse.json({ selectedDate: date, stocks })
    : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}

export async function DELETE(request: Request, { params }: Context) {
  const username = usernameFromRequest(request);
  if (!username)
    return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  const { date } = await params;
  if (!validDate(date))
    return NextResponse.json({ error: "日期无效" }, { status: 400 });
  return deleteWatchlistDay(username, date)
    ? new Response(null, { status: 204 })
    : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}
