import { NextRequest, NextResponse } from 'next/server';
// import { recordRequestDuration } from './lib/metrics';

// Security headers for all responses
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'on',
};

// Rate limiting state (in-memory, per-instance)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration per route pattern
const RATE_LIMIT_CONFIG: Array<{ pattern: RegExp; limit: number; windowMs: number }> = [
  { pattern: /\/api\/v1\/auth\/login/, limit: 10, windowMs: 15 * 60 * 1000 },
  { pattern: /\/api\/v1\/auth\/register/, limit: 5, windowMs: 60 * 60 * 1000 },
  { pattern: /\/api\/v1\/auth\/forgot-password/, limit: 5, windowMs: 15 * 60 * 1000 },
  { pattern: /\/api\/v1\/auth\/reset-password/, limit: 5, windowMs: 15 * 60 * 1000 },
  { pattern: /\/api\/v1\/ai\/chat/, limit: 20, windowMs: 60 * 1000 },
  { pattern: /\/api\/v1\/ai\/stream/, limit: 10, windowMs: 60 * 1000 },
  { pattern: /\/api\/v1\/ai\/embeddings/, limit: 50, windowMs: 60 * 1000 },
];

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0]?.trim() || realIP || 'unknown';
}

function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetTime: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime };
}

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000).unref?.();
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Request logging
  const startTime = Date.now();
  const clientIP = getClientIP(request);
  console.log(JSON.stringify({
    level: 'info',
    ts: new Date().toISOString(),
    msg: 'Incoming request',
    method: request.method,
    url: request.url,
    ip: clientIP,
    userAgent: request.headers.get('user-agent') || 'unknown'
  }));

  // Apply rate limiting to configured routes
  for (const config of RATE_LIMIT_CONFIG) {
    if (config.pattern.test(pathname)) {
      const clientIP = getClientIP(request);
      const rateLimitKey = `${pathname}:${clientIP}`;
      const result = checkRateLimit(rateLimitKey, config.limit, config.windowMs);

      if (!result.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Rate limit exceeded. Please try again later.',
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(config.limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(result.resetTime),
              'Retry-After': String(Math.ceil((result.resetTime - Date.now()) / 1000)),
            },
          }
        );
      }
      break;
    }
  }

  // Add security headers to response
  const response = NextResponse.next();

  // Apply security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // Log response time
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
  const durationMs = Date.now() - startTime;
  // recordRequestDuration(request.method, pathname, response.status, durationMs);
  console.log(JSON.stringify({
    level: 'info',
    ts: new Date().toISOString(),
    msg: 'Request completed',
    method: request.method,
    url: request.url,
    status: response.status,
    durationMs: durationMs
  }));

  // Add rate limit headers
  for (const config of RATE_LIMIT_CONFIG) {
    if (config.pattern.test(pathname)) {
      const rateLimitKey = `${pathname}:${clientIP}`;
      const entry = rateLimitStore.get(rateLimitKey);
      if (entry) {
        response.headers.set('X-RateLimit-Limit', String(config.limit));
        response.headers.set('X-RateLimit-Remaining', String(Math.max(0, config.limit - entry.count)));
        response.headers.set('X-RateLimit-Reset', String(entry.resetTime));
      }
      break;
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
