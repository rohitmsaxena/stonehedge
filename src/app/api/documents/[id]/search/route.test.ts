import { GET } from './route';
import { getDocumentText } from '@/lib/services/document.service';
import { NextRequest } from 'next/server';

jest.mock('@/lib/services/document.service', () => ({
  getDocumentText: jest.fn(),
}));

const mockGetDocumentText = getDocumentText as jest.Mock;

function makeRequest(id: string, query?: string) {
  const url = query
    ? `http://localhost:3000/api/documents/${id}/search?q=${encodeURIComponent(query)}`
    : `http://localhost:3000/api/documents/${id}/search`;
  return {
    request: new NextRequest(url),
    params: Promise.resolve({ id }),
  };
}

describe('GET /api/documents/:id/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return matching snippets', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'This agreement is entered into by and between the parties for the provision of legal services.',
      version: 1,
    });

    const { request, params } = makeRequest('doc_1', 'agreement');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.matches[0].snippet).toContain('agreement');
    expect(data.matches[0].position).toBe(5);
  });

  it('should be case insensitive', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The Agreement is binding.',
      version: 1,
    });

    const { request, params } = makeRequest('doc_1', 'agreement');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
  });

  it('should find multiple matches', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'the cat and the dog and the bird',
      version: 1,
    });

    const { request, params } = makeRequest('doc_1', 'the');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(3);
  });

  it('should return empty matches for no results', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The quick brown fox',
      version: 1,
    });

    const { request, params } = makeRequest('doc_1', 'zebra');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(0);
    expect(data.matches).toEqual([]);
  });

  it('should return 400 if query param is missing', async () => {
    const { request, params } = makeRequest('doc_1');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing 'q' query parameter");
  });

  it('should return 404 if document not found', async () => {
    mockGetDocumentText.mockRejectedValue(new Error('Not found'));

    const { request, params } = makeRequest('nonexistent', 'test');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Document not found');
  });
});
