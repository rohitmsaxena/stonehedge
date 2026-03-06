import {
  searchDocuments,
  buildIndex,
  resetIndex,
  updateIndexForDocument,
} from './search.service';
import { prisma } from '@/lib/prisma';
import { getDocumentText } from './document.service';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('./document.service', () => ({
  getDocumentText: jest.fn(),
}));

const mockDocFindMany = prisma.document.findMany as jest.Mock;
const mockDocFindUnique = prisma.document.findUnique as jest.Mock;
const mockGetDocumentText = getDocumentText as jest.Mock;

describe('search.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'time').mockImplementation(() => {});
    jest.spyOn(console, 'timeEnd').mockImplementation(() => {});
    resetIndex();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockDocs = [
    { id: 'doc_1', title: 'Agreement A' },
    { id: 'doc_2', title: 'Agreement B' },
    { id: 'doc_3', title: 'Memo C' },
  ];

  function setupMocks() {
    mockDocFindMany.mockResolvedValue(mockDocs);
    mockGetDocumentText
      .mockResolvedValueOnce({
        text: 'The contractor shall provide all necessary services to the client.',
        version: 1,
      })
      .mockResolvedValueOnce({
        text: 'The vendor shall deliver goods on time.',
        version: 1,
      })
      .mockResolvedValueOnce({
        text: 'Meeting notes from Tuesday. No legal terms here.',
        version: 1,
      });
  }

  describe('buildIndex', () => {
    it('should index all documents', async () => {
      setupMocks();

      await buildIndex();

      // Search should now work without re-querying
      const results = await searchDocuments('shall');

      expect(results.total).toBe(2);
      expect(results.matches.map((m) => m.documentId)).toContain('doc_1');
      expect(results.matches.map((m) => m.documentId)).toContain('doc_2');
    });
  });

  describe('searchDocuments', () => {
    it('should find matches across multiple documents', async () => {
      setupMocks();

      const results = await searchDocuments('shall');

      expect(results.total).toBe(2);
      expect(results.matches[0].snippet).toContain('shall');
      expect(results.matches[1].snippet).toContain('shall');
    });

    it('should be case insensitive', async () => {
      mockDocFindMany.mockResolvedValue([{ id: 'doc_1', title: 'Doc' }]);
      mockGetDocumentText.mockResolvedValue({
        text: 'The Contractor SHALL provide services.',
        version: 1,
      });

      const results = await searchDocuments('shall');

      expect(results.total).toBe(1);
    });

    it('should return empty for no matches', async () => {
      setupMocks();

      const results = await searchDocuments('zebra');

      expect(results.total).toBe(0);
      expect(results.matches).toEqual([]);
    });

    it('should respect limit and offset', async () => {
      mockDocFindMany.mockResolvedValue([{ id: 'doc_1', title: 'Doc' }]);
      mockGetDocumentText.mockResolvedValue({
        text: 'the cat and the dog and the bird and the fish and the frog',
        version: 1,
      });

      const results = await searchDocuments('the', 2, 2);

      expect(results.total).toBe(5);
      expect(results.matches).toHaveLength(2);
    });

    it('should require ALL query words (AND search)', async () => {
      setupMocks();

      // "contractor" only appears in doc_1
      const results = await searchDocuments('contractor services');

      expect(results.total).toBeGreaterThanOrEqual(1);
      expect(results.matches.every((m) => m.documentId === 'doc_1')).toBe(true);
    });

    it('should return empty if one query word has no matches', async () => {
      setupMocks();

      const results = await searchDocuments('shall xyznonexistent');

      expect(results.total).toBe(0);
    });

    it('should find multiple occurrences in same document', async () => {
      mockDocFindMany.mockResolvedValue([{ id: 'doc_1', title: 'Doc' }]);
      mockGetDocumentText.mockResolvedValue({
        text: 'the quick the slow the fast',
        version: 1,
      });

      const results = await searchDocuments('the');

      expect(results.total).toBe(3);
    });
  });

  describe('updateIndexForDocument', () => {
    it('should update index after a document changes', async () => {
      setupMocks();
      await buildIndex();

      // Verify "contractor" matches doc_1
      let results = await searchDocuments('contractor');
      expect(results.total).toBeGreaterThanOrEqual(1);

      // Now update doc_1 to remove "contractor"
      mockDocFindUnique.mockResolvedValue({ title: 'Agreement A' });
      mockGetDocumentText.mockResolvedValue({
        text: 'The employee shall provide all necessary services to the client.',
        version: 2,
      });

      await updateIndexForDocument('doc_1');

      // "contractor" should no longer match
      results = await searchDocuments('contractor');
      expect(results.total).toBe(0);

      // "employee" should now match
      results = await searchDocuments('employee');
      expect(results.total).toBeGreaterThanOrEqual(1);
    });
  });
});
