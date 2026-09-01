import { NextResponse } from "next/server";

import { getDashboardStatus } from "@/server/dashboard";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getDashboardStatus());
}
