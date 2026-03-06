// Mock prisma
import { prisma } from '@/lib/prisma';
import {
  buildVisibleText,
  getDocumentText,
  getOrderedNodes,
  invalidateCache,
} from '@/lib/services/document.service';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    charNode: {
      findMany: jest.fn(),
    },
    document: {
      findUniqueOrThrow: jest.fn(),
    },
  },
}));

const mockCharNodeFindMany = prisma.charNode.findMany as jest.Mock;
const mockDocFindUnique = prisma.document.findUniqueOrThrow as jest.Mock;

describe('document.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateCache('doc_1');
  });

  describe('getOrderedNodes', () => {
    it('should return nodes in linked list order', async () => {
      mockCharNodeFindMany.mockResolvedValue([
        { id: 'n3', content: 'world', afterId: 'n2', deleted: false },
        { id: 'n1', content: 'Hello ', afterId: null, deleted: false },
        { id: 'n2', content: 'beautiful ', afterId: 'n1', deleted: false },
      ]);

      const result = await getOrderedNodes('doc_1');

      expect(result.map((n) => n.content)).toEqual([
        'Hello ',
        'beautiful ',
        'world',
      ]);
    });

    it('should handle a single node', async () => {
      mockCharNodeFindMany.mockResolvedValue([
        { id: 'n1', content: 'Hello', afterId: null, deleted: false },
      ]);

      const result = await getOrderedNodes('doc_1');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello');
    });

    it('should return empty array when no nodes exist', async () => {
      mockCharNodeFindMany.mockResolvedValue([]);

      const result = await getOrderedNodes('doc_1');

      expect(result).toEqual([]);
    });
  });

  describe('buildVisibleText', () => {
    it('should concatenate visible node content', () => {
      const nodes = [
        { content: 'Hello ', deleted: false },
        { content: 'world', deleted: false },
      ];

      expect(buildVisibleText(nodes)).toBe('Hello world');
    });

    it('should skip deleted nodes', () => {
      const nodes = [
        { content: 'Hello ', deleted: false },
        { content: 'cruel ', deleted: true },
        { content: 'world', deleted: false },
      ];

      expect(buildVisibleText(nodes)).toBe('Hello world');
    });

    it('should return empty string when all nodes are deleted', () => {
      const nodes = [
        { content: 'Hello ', deleted: true },
        { content: 'world', deleted: true },
      ];

      expect(buildVisibleText(nodes)).toBe('');
    });
  });

  describe('getDocumentText', () => {
    const mockNodes = [
      { id: 'n1', content: 'The ', afterId: null, deleted: false },
      { id: 'n2', content: 'quick ', afterId: 'n1', deleted: false },
      { id: 'n3', content: 'fox', afterId: 'n2', deleted: false },
    ];

    it('should build text and cache it', async () => {
      mockDocFindUnique.mockResolvedValue({ id: 'doc_1', version: 1 });
      mockCharNodeFindMany.mockResolvedValue(mockNodes);

      const result = await getDocumentText('doc_1');

      expect(result.text).toBe('The quick fox');
      expect(result.version).toBe(1);
      expect(result.nodeIds).toEqual(['n1', 'n2', 'n3']);
    });

    it('should return cached result on same version', async () => {
      mockDocFindUnique.mockResolvedValue({ id: 'doc_1', version: 1 });
      mockCharNodeFindMany.mockResolvedValue(mockNodes);

      await getDocumentText('doc_1');

      // Second call — should use cache, not query nodes again
      await getDocumentText('doc_1');

      expect(mockCharNodeFindMany).toHaveBeenCalledTimes(1);
    });

    it('should rebuild when version changes', async () => {
      mockDocFindUnique.mockResolvedValue({ id: 'doc_1', version: 1 });
      mockCharNodeFindMany.mockResolvedValue(mockNodes);

      await getDocumentText('doc_1');

      // Version bumped
      mockDocFindUnique.mockResolvedValue({ id: 'doc_1', version: 2 });
      mockCharNodeFindMany.mockResolvedValue([
        ...mockNodes,
        { id: 'n4', content: ' jumped', afterId: 'n3', deleted: false },
      ]);

      const result = await getDocumentText('doc_1');

      expect(result.text).toBe('The quick fox jumped');
      expect(mockCharNodeFindMany).toHaveBeenCalledTimes(2);
    });

    it('should skip deleted nodes in text and nodeIds', async () => {
      mockDocFindUnique.mockResolvedValue({ id: 'doc_1', version: 1 });
      mockCharNodeFindMany.mockResolvedValue([
        { id: 'n1', content: 'The ', afterId: null, deleted: false },
        { id: 'n2', content: 'quick ', afterId: 'n1', deleted: true },
        { id: 'n3', content: 'fox', afterId: 'n2', deleted: false },
      ]);

      const result = await getDocumentText('doc_1');

      expect(result.text).toBe('The fox');
      expect(result.nodeIds).toEqual(['n1', 'n3']);
    });
  });
});
