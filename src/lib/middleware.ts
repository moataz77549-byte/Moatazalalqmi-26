import { validateSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { hashApiKey } from '@/lib/ai-gateway/key-vault';
import { NextRequest } from 'next/server';

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>;

export async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);

  // Try API key first (format: mz_xxx)
  if (token.startsWith('mz_')) {
    const keyHash = hashApiKey(token);
    const apiKey = await db.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!apiKey || apiKey.isRevoked) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Update lastUsedAt
    await db.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return apiKey.user;
  }

  // Fall back to session token
  const session = await validateSession(token);
  if (!session) return null;

  return session.user;
}

/**
 * Requires authentication and returns the non-null user.
 * Throws if user is null.
 * Usage: const user = requireAuth(await getAuthUser(request));
 */
export function requireAuth(user: Awaited<ReturnType<typeof getAuthUser>>): AuthUser {
  if (!user) throw new AuthError('Unauthorized');
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
