import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/users
 * List all users.
 */
export async function GET() {
  try {
    const users = await prisma.user.findMany();
    return NextResponse.json(users);
  } catch (error) {
    console.error('[GET /api/users] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users', code: 500 },
      { status: 500 }
    );
  }
}
