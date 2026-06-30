import { getMetrics } from "@/lib/metrics";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const metrics = await getMetrics();
    return new NextResponse(metrics, { headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    console.error("Failed to get metrics:", error);
    return NextResponse.json({ error: "Failed to retrieve metrics" }, { status: 500 });
  }
}
