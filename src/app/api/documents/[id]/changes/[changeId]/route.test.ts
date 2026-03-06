import { PATCH } from './route';
import { prisma } from '@/lib/prisma';
import { applyChanges } from '@/lib/services/change.service';
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    change: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/services/change.service', () => ({
  applyChanges: jest.fn(),
}));

jest.mock('@/lib/services/document.service', () => ({
  invalidateCache: jest.fn(),
}));

jest.mock('@/lib/services/search.service', () => ({
  updateIndexForDocument: jest.fn(),
}));

const mockChangeFindUnique = prisma.change.findUnique as jest.Mock;
const mockChangeUpdate = prisma.change.update as jest.Mock;
const mockApplyChanges = applyChanges as jest.Mock;

function makeRequest(id: string, changeId: string, body: object) {
  return {
    request: new NextRequest(
      `http://localhost:3000/api/documents/${id}/changes/${changeId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      }
    ),
    params: Promise.resolve({ id, changeId }),
  };
}

describe('PATCH /api/documents/:id/changes/:changeId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pendingChange = {
    id: 'ch_1',
    type: 'replace',
    status: 'pending',
    deleteIds: JSON.stringify(['n2']),
    afterId: 'n1',
    newText: 'slow ',
    documentId: 'doc_1',
    userId: 'user_1',
  };

  describe('approve', () => {
    it('should apply change and update status to accepted', async () => {
      mockChangeFindUnique.mockResolvedValue(pendingChange);
      mockApplyChanges.mockResolvedValue(undefined);
      mockChangeUpdate.mockResolvedValue({});

      const { request, params } = makeRequest('doc_1', 'ch_1', {
        action: 'approve',
      });
      const response = await PATCH(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('accepted');

      expect(mockApplyChanges).toHaveBeenCalledWith(
        'doc_1',
        [
          {
            type: 'replace',
            deleteIds: ['n2'],
            afterId: 'n1',
            newText: 'slow ',
          },
        ],
        'user_1'
      );

      expect(mockChangeUpdate).toHaveBeenCalledWith({
        where: { id: 'ch_1' },
        data: { status: 'accepted' },
      });
    });

    it('should handle delete change approval', async () => {
      const deleteChange = {
        ...pendingChange,
        type: 'delete',
        newText: null,
        afterId: null,
      };
      mockChangeFindUnique.mockResolvedValue(deleteChange);
      mockApplyChanges.mockResolvedValue(undefined);
      mockChangeUpdate.mockResolvedValue({});

      const { request, params } = makeRequest('doc_1', 'ch_1', {
        action: 'approve',
      });
      const response = await PATCH(request, { params });

      expect(response.status).toBe(200);
      expect(mockApplyChanges).toHaveBeenCalledWith(
        'doc_1',
        [
          {
            type: 'delete',
            deleteIds: ['n2'],
            afterId: null,
            newText: undefined,
          },
        ],
        'user_1'
      );
    });
  });

  describe('reject', () => {
    it('should update status to rejected without applying', async () => {
      mockChangeFindUnique.mockResolvedValue(pendingChange);
      mockChangeUpdate.mockResolvedValue({});

      const { request, params } = makeRequest('doc_1', 'ch_1', {
        action: 'reject',
      });
      const response = await PATCH(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('rejected');

      expect(mockApplyChanges).not.toHaveBeenCalled();

      expect(mockChangeUpdate).toHaveBeenCalledWith({
        where: { id: 'ch_1' },
        data: { status: 'rejected' },
      });
    });
  });

  describe('validation', () => {
    it('should return 400 for invalid action', async () => {
      const { request, params } = makeRequest('doc_1', 'ch_1', {
        action: 'invalid',
      });
      const response = await PATCH(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });

    it('should return 400 for missing action', async () => {
      const { request, params } = makeRequest('doc_1', 'ch_1', {});
      const response = await PATCH(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });

    it('should return 400 if change is already accepted', async () => {
      mockChangeFindUnique.mockResolvedValue({
        ...pendingChange,
        status: 'accepted',
      });

      const { request, params } = makeRequest('doc_1', 'ch_1', {
        action: 'approve',
      });
      const response = await PATCH(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('already accepted');
    });
  });
});
