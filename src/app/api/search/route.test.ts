import { GET } from './route';
import { searchDocuments } from '@/lib/services/search.service';
import { NextRequest } from 'next/server';

jest.mock('@/lib/services/search.service', () => ({
  searchDocuments: jest.fn(),
}));

const mockSearchDocuments = searchDocuments as jest.Mock;

function makeRequest(query?: string, limit?: number, offset?: number) {
  let url = 'http://localhost:3000/api/search';
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (limit) params.set('limit', limit.toString());
  if (offset) params.set('offset', offset.toString());
  if (params.toString()) url += `?${params.toString()}`;
  return new NextRequest(url);
}

describe('GET /api/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return search results from inverted index', async () => {
    mockSearchDocuments.mockResolvedValue({
      matches: [
        {
          documentId: 'doc_1',
          documentTitle: 'Agreement A',
          snippet: '...shall provide...',
          position: 20,
        },
        {
          documentId: 'doc_2',
          documentTitle: 'Agreement B',
          snippet: '...shall deliver...',
          position: 15,
        },
      ],
      total: 2,
    });

    const response = await GET(makeRequest('shall'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.matches).toHaveLength(2);
    expect(mockSearchDocuments).toHaveBeenCalledWith('shall', 10, 0);
  });

  it('should pass limit and offset to search service', async () => {
    mockSearchDocuments.mockResolvedValue({ matches: [], total: 0 });

    await GET(makeRequest('test', 5, 10));

    expect(mockSearchDocuments).toHaveBeenCalledWith('test', 5, 10);
  });

  it('should return empty results when no matches', async () => {
    mockSearchDocuments.mockResolvedValue({ matches: [], total: 0 });

    const response = await GET(makeRequest('zebra'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(0);
    expect(data.matches).toEqual([]);
  });

  it('should return 400 if query is missing', async () => {
    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing 'q' query parameter");
  });

  it('should return 500 on error', async () => {
    mockSearchDocuments.mockRejectedValue(new Error('Index error'));

    const response = await GET(makeRequest('test'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Search failed');
  });
});
