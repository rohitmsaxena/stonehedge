import { GET } from './route';
import { prisma } from '@/lib/prisma';
import { mock_docs } from '@/app/api/documents/document.mock';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      findMany: jest.fn(),
    },
  },
}));

describe('GET /api/documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return all documents', async () => {
    const docs = mock_docs;
    (prisma.document.findMany as jest.Mock).mockResolvedValue(docs);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].title).toBe('Service Agreement');
  });

  it('should return 500 on error', async () => {
    (prisma.document.findMany as jest.Mock).mockRejectedValue(
      new Error('DB error')
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch documents');
  });
});
