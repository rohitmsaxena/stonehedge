import { splitIntoWords, applyChanges } from './change.service';
import { prisma } from '@/lib/prisma';
import { invalidateCache } from './document.service';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    charNode: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    document: {
      update: jest.fn(),
    },
  },
}));

jest.mock('./document.service', () => ({
  invalidateCache: jest.fn(),
}));

const mockNodeUpdateMany = prisma.charNode.updateMany as jest.Mock;
const mockNodeFindUnique = prisma.charNode.findUnique as jest.Mock;
const mockNodeFindFirst = prisma.charNode.findFirst as jest.Mock;
const mockNodeCreate = prisma.charNode.create as jest.Mock;
const mockNodeUpdate = prisma.charNode.update as jest.Mock;
const mockDocUpdate = prisma.document.update as jest.Mock;

describe('change.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('splitIntoWords', () => {
    it('should split simple sentence into words with trailing spaces', () => {
      expect(splitIntoWords('The quick fox')).toEqual([
        'The ',
        'quick ',
        'fox',
      ]);
    });

    it('should handle a single word', () => {
      expect(splitIntoWords('Hello')).toEqual(['Hello']);
    });

    it('should handle multiple spaces between words', () => {
      const result = splitIntoWords('Hello  world');
      expect(result.join('')).toBe('Hello  world');
    });

    it('should return empty array for empty string', () => {
      expect(splitIntoWords('')).toEqual([]);
    });

    it('should handle trailing whitespace', () => {
      const result = splitIntoWords('Hello world ');
      expect(result.join('')).toBe('Hello world ');
    });

    it('should handle punctuation attached to words', () => {
      expect(splitIntoWords('Hello, world!')).toEqual(['Hello, ', 'world!']);
    });
  });

  describe('applyChanges', () => {
    const docId = 'doc_1';
    const userId = 'user_1';

    beforeEach(() => {
      mockDocUpdate.mockResolvedValue({});
    });

    it('should tombstone nodes for a delete operation without creating Change records', async () => {
      await applyChanges(
        docId,
        [
          {
            type: 'delete',
            deleteIds: ['n2', 'n3'],
            afterId: null,
          },
        ],
        userId
      );

      expect(mockNodeUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['n2', 'n3'] } },
        data: { deleted: true },
      });

      expect(mockDocUpdate).toHaveBeenCalledWith({
        where: { id: docId },
        data: { version: { increment: 1 } },
      });

      expect(invalidateCache).toHaveBeenCalledWith(docId);
    });

    it('should create new nodes for an insert operation', async () => {
      mockNodeFindFirst.mockResolvedValue({
        id: 'n2',
        afterId: 'n1',
      });

      let createCount = 0;
      mockNodeCreate.mockImplementation(() => {
        createCount++;
        return Promise.resolve({ id: `new_${createCount}` });
      });

      mockNodeUpdate.mockResolvedValue({});

      await applyChanges(
        docId,
        [
          {
            type: 'insert',
            deleteIds: [],
            afterId: 'n1',
            newText: 'very quick ',
          },
        ],
        userId
      );

      // "very quick " -> ["very ", "quick "]
      expect(mockNodeCreate).toHaveBeenCalledTimes(2);

      expect(mockNodeCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: 'very ',
          afterId: 'n1',
          documentId: docId,
        }),
      });

      expect(mockNodeCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: 'quick ',
          afterId: 'new_1',
          documentId: docId,
        }),
      });

      // Restitch
      expect(mockNodeUpdate).toHaveBeenCalledWith({
        where: { id: 'n2' },
        data: { afterId: 'new_2' },
      });
    });

    it('should tombstone and insert for a replace operation', async () => {
      mockNodeFindUnique
        .mockResolvedValueOnce({ id: 'n2', afterId: 'n1' })
        .mockResolvedValueOnce({ id: 'n2', afterId: 'n1' });

      mockNodeFindFirst
        .mockResolvedValueOnce({ id: 'n3', afterId: 'n2' })
        .mockResolvedValueOnce({ id: 'n3', afterId: 'n2' });

      mockNodeCreate.mockResolvedValue({ id: 'new_1' });
      mockNodeUpdate.mockResolvedValue({});

      await applyChanges(
        docId,
        [
          {
            type: 'replace',
            deleteIds: ['n2'],
            afterId: 'n1',
            newText: 'slow ',
          },
        ],
        userId
      );

      expect(mockNodeUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['n2'] } },
        data: { deleted: true },
      });

      expect(mockNodeCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: 'slow ',
          afterId: 'n1',
          documentId: docId,
        }),
      });
    });

    it('should handle multiple operations in sequence', async () => {
      mockNodeFindUnique.mockResolvedValue({ id: 'n2', afterId: 'n1' });
      mockNodeFindFirst.mockResolvedValue(null);
      mockNodeCreate.mockResolvedValue({ id: 'new_1' });

      await applyChanges(
        docId,
        [
          {
            type: 'delete',
            deleteIds: ['n4'],
            afterId: null,
          },
          {
            type: 'replace',
            deleteIds: ['n2'],
            afterId: 'n1',
            newText: 'slow ',
          },
        ],
        userId
      );

      // Version only incremented once at the end
      expect(mockDocUpdate).toHaveBeenCalledTimes(1);
    });

    it('should skip operation if deleted node not found', async () => {
      mockNodeFindUnique.mockResolvedValue(null);

      await applyChanges(
        docId,
        [
          {
            type: 'replace',
            deleteIds: ['nonexistent'],
            afterId: 'n1',
            newText: 'slow ',
          },
        ],
        userId
      );

      expect(mockNodeCreate).not.toHaveBeenCalled();
      expect(mockDocUpdate).toHaveBeenCalled();
    });
  });
});
