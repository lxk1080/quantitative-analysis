import { NextResponse } from "next/server";
import { z } from "zod";
import { addWatchlistStock, listWatchlistDays } from "@/server/watchlists";
import { usernameFromRequest } from "@/server/username";

export const runtime = "nodejs";
const addSchema = z.object({
  stockCode: z.string().regex(/^\d{6}$/),
  ruleTitle: z.string().trim().min(1).max(80),
  industry: z.string().trim().max(100).nullable(),
});

export async function GET(request: Request) {
  const username = usernameFromRequest(request);
  if (!username)
    return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  return NextResponse.json({ days: listWatchlistDays(username) });
}

export async function POST(request: Request) {
  const username = usernameFromRequest(request);
  if (!username)
    return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  const parsed = addSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "自选股票信息无效" }, { status: 400 });
  const result = addWatchlistStock(
    username,
    parsed.data.stockCode,
    parsed.data.ruleTitle,
    parsed.data.industry,
  );
  if (result.status === "not_found")
    return NextResponse.json({ error: "股票不存在" }, { status: 404 });
  return NextResponse.json(result, {
    status: result.status === "added" ? 201 : 200,
  });
}
