import { NextRequest, NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/services/search.service';

/**
 * GET /api/search?q=keyword&limit=10&offset=0
 * Search across all documents using the inverted index.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10');
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

  if (!query) {
    return NextResponse.json(
      { error: "Missing 'q' query parameter", code: 400 },
      { status: 400 }
    );
  }

  try {
    console.log(
      `[GET /api/search] Searching for "${query}", limit=${limit}, offset=${offset}`
    );

    const results = await searchDocuments(query, limit, offset);

    console.log(
      `[GET /api/search] Found ${results.total} total matches, returning ${results.matches.length}`
    );

    return NextResponse.json({
      query,
      ...results,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[GET /api/search] Error:', error);
    return NextResponse.json(
      { error: 'Search failed', code: 500 },
      { status: 500 }
    );
  }
}
