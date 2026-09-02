import { NextResponse } from "next/server";

import { getScreeningPresets } from "@/server/screening-presets";
import { listCustomCollections } from "@/server/custom-collections";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ presets: getScreeningPresets(), collections: await listCustomCollections() });
}
