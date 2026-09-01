import { NextResponse } from "next/server";

import { getScreeningPresets } from "@/server/screening-presets";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ presets: getScreeningPresets() });
}
