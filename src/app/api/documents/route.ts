import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/documents
 * List all documents with basic metadata.
 */
export async function GET() {
  try {
    const documents = await prisma.document.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`[GET /api/documents]  Found ${documents.length} documents`);

    return NextResponse.json(documents);
  } catch (error) {
    console.error('[GET /api/documents] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents', code: 500 },
      { status: 500 }
    );
  }
}
