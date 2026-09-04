import { NextResponse } from "next/server";

export const runtime = "nodejs";

const thsUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractLimitUpReason(html: string) {
  const text = decodeHtml(html);
  const match = text.match(
    /(?:触及)?涨停\s*[，,]?\s*分析或为\s*[：:]\s*(.{2,120}?)(?=\s*涨停分析|\s*(?:行业原因|公司原因)\s*[：:])/,
  );
  return match?.[1].trim() ?? null;
}

function extractIndustry(html: string) {
  const text = decodeHtml(html);
  const match = text.match(/所属申万行业\s*[：:]\s*([^|｜]{2,40}?)(?=\s*(?:概念行情贴合度|市盈率|\||｜))/);
  return match?.[1].trim() ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "股票代码格式无效" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://basic.10jqka.com.cn/${code}/`, {
      headers: {
        "user-agent": thsUserAgent,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`同花顺返回 ${response.status}`);
    // 同花顺 F10 页面声明为 GBK；response.text() 会按 UTF-8 解码，中文字段会全变成乱码。
    const html = new TextDecoder("gbk").decode(await response.arrayBuffer());
    return NextResponse.json({
      reason: extractLimitUpReason(html),
      industry: extractIndustry(html),
    });
  } catch {
    return NextResponse.json({ reason: null, industry: null });
  }
}
