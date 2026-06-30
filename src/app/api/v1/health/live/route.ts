import { NextResponse } from "next/server";

// Liveness: process is up and the event loop is responsive.
// Must NOT depend on the database — Railway/Docker use this to decide
// whether to restart the container, so it should only fail if the
// process itself is broken.
export async function GET() {
  return NextResponse.json(
    {
      status: "alive",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
