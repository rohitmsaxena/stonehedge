import { NextRequest, NextResponse } from 'next/server';
import { getDocumentText } from '@/lib/services/document.service';

/**
 * GET /api/documents/:id
 * Returns the visible text and version for a document.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { text, version } = await getDocumentText(id);

    console.log(
      `[GET /api/documents/${id}] Version ${version}, length ${text.length}`
    );

    return NextResponse.json({ id, text, version });
  } catch (error) {
    console.error(`[GET /api/documents/${id}] Error:`, error);
    return NextResponse.json(
      { error: 'Document not found', code: 404 },
      { status: 404 }
    );
  }
}
