import { NextRequest, NextResponse } from 'next/server';
import { getDocumentText } from '@/lib/services/document.service';

/**
 * GET /api/documents/:id/search?q=keyword
 * Search within a document's visible text.
 * Returns matching snippets with surrounding context.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const query = request.nextUrl.searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { error: "Missing 'q' query parameter", code: 400 },
      { status: 400 }
    );
  }

  try {
    const { text, version } = await getDocumentText(id);

    console.log(`[GET /api/documents/${id}/search] Searching for "${query}"`);

    const matches: { snippet: string; position: number }[] = [];
    const contextChars = 40;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let searchFrom = 0;
    while (true) {
      const pos = lowerText.indexOf(lowerQuery, searchFrom);
      if (pos === -1) break;

      const start = Math.max(0, pos - contextChars);
      const end = Math.min(text.length, pos + query.length + contextChars);
      const snippet =
        (start > 0 ? '...' : '') +
        text.slice(start, end) +
        (end < text.length ? '...' : '');

      matches.push({ snippet, position: pos });
      searchFrom = pos + 1;
    }

    console.log(
      `[GET /api/documents/${id}/search] Found ${matches.length} matches`
    );

    return NextResponse.json({
      documentId: id,
      query,
      version,
      matches,
      total: matches.length,
    });
  } catch (error) {
    console.error(`[GET /api/documents/${id}/search] Error:`, error);
    return NextResponse.json(
      { error: 'Document not found', code: 404 },
      { status: 404 }
    );
  }
}
