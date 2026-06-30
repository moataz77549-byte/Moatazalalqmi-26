import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Test database connectivity with a simple query
    await db.user.count({ take: 1 });

    return NextResponse.json(
      successResponse({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: config.app.version,
        database: 'connected',
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Readiness check error:', error);
    return NextResponse.json(
      errorResponse('Service unavailable'),
      { status: 500 }
    );
  }
}
