import { getRunEbk } from "@/server/dashboard";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exported = getRunEbk(id);
  if (!exported) return Response.json({ error: "筛选结果不存在" }, { status: 404 });
  return new Response(exported.content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exported.fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
