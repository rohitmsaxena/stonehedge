import { GET } from './route';
import { getDocumentText } from '@/lib/services/document.service';
import { NextRequest } from 'next/server';
import { mock_doc_1 } from '@/app/api/documents/document.mock';

jest.mock('@/lib/services/document.service', () => ({
  getDocumentText: jest.fn(),
}));

const mockGetDocumentText = getDocumentText as jest.Mock;

function makeRequest(id: string) {
  const request = new NextRequest(`http://localhost:3000/api/documents/${id}`);
  const params = Promise.resolve({ id });
  return { request, params };
}

describe('GET /api/documents/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return document text and version', async () => {
    mockGetDocumentText.mockResolvedValue(mock_doc_1);

    const { request, params } = makeRequest('doc_1');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('doc_1');
    expect(data.text).toBe('The quick brown fox');
    expect(data.version).toBe(1);
  });

  it('should return 404 if document not found', async () => {
    mockGetDocumentText.mockRejectedValue(new Error('Not found'));

    const { request, params } = makeRequest('nonexistent');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Document not found');
  });
});
