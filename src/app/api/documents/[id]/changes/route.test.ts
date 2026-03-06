import { GET, POST } from './route';
import { getDocumentText } from '@/lib/services/document.service';
import { computeChanges } from '@/lib/services/diff.service';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

jest.mock('@/lib/services/document.service', () => ({
  getDocumentText: jest.fn(),
}));

jest.mock('@/lib/services/diff.service', () => ({
  computeChanges: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    charNode: {
      findMany: jest.fn(),
    },
    change: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockGetDocumentText = getDocumentText as jest.Mock;
const mockComputeChanges = computeChanges as jest.Mock;
const mockNodeFindMany = prisma.charNode.findMany as jest.Mock;
const mockChangeCreate = prisma.change.create as jest.Mock;
const mockChangeFindMany = prisma.change.findMany as jest.Mock;

function makePostRequest(id: string, body: object) {
  return {
    request: new NextRequest(
      `http://localhost:3000/api/documents/${id}/changes`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),
    params: Promise.resolve({ id }),
  };
}

function makeGetRequest(id: string) {
  return {
    request: new NextRequest(
      `http://localhost:3000/api/documents/${id}/changes`
    ),
    params: Promise.resolve({ id }),
  };
}

describe('POST /api/documents/:id/changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const validBody = {
    text: 'The slow brown fox',
    version: 1,
    userId: 'user_1',
  };

  const mockNodes = [
    { id: 'n1', content: 'The ', afterId: null, deleted: false },
    { id: 'n2', content: 'quick ', afterId: 'n1', deleted: false },
    { id: 'n3', content: 'brown ', afterId: 'n2', deleted: false },
    { id: 'n4', content: 'fox', afterId: 'n3', deleted: false },
  ];

  it('should compute diffs and store as pending changes with originalText', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The quick brown fox',
      version: 1,
      nodeIds: ['n1', 'n2', 'n3', 'n4'],
    });

    mockNodeFindMany.mockResolvedValue(mockNodes);

    mockComputeChanges.mockReturnValue([
      { type: 'replace', deleteIds: ['n2'], afterId: 'n1', newText: 'slow ' },
    ]);

    mockChangeCreate.mockResolvedValue({
      id: 'ch_1',
      type: 'replace',
      status: 'pending',
      deleteIds: JSON.stringify(['n2']),
      afterId: 'n1',
      newText: 'slow ',
      originalText: 'quick ',
      documentId: 'doc_1',
      userId: 'user_1',
    });

    const { request, params } = makePostRequest('doc_1', validBody);
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.changes).toBe(1);
    expect(data.pending).toHaveLength(1);
    expect(data.pending[0].status).toBe('pending');
    expect(data.pending[0].originalText).toBe('quick ');

    expect(mockChangeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'replace',
        status: 'pending',
        deleteIds: JSON.stringify(['n2']),
        afterId: 'n1',
        newText: 'slow ',
        originalText: 'quick ',
        documentId: 'doc_1',
        userId: 'user_1',
      }),
    });
  });

  it('should store null originalText for insert operations', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The fox',
      version: 1,
      nodeIds: ['n1', 'n4'],
    });

    mockNodeFindMany.mockResolvedValue([
      { id: 'n1', content: 'The ', afterId: null, deleted: false },
      { id: 'n4', content: 'fox', afterId: 'n1', deleted: false },
    ]);

    mockComputeChanges.mockReturnValue([
      { type: 'insert', deleteIds: [], afterId: 'n1', newText: 'quick ' },
    ]);

    mockChangeCreate.mockResolvedValue({
      id: 'ch_1',
      type: 'insert',
      status: 'pending',
      deleteIds: JSON.stringify([]),
      afterId: 'n1',
      newText: 'quick ',
      originalText: null,
      documentId: 'doc_1',
      userId: 'user_1',
    });

    const { request, params } = makePostRequest('doc_1', {
      text: 'The quick fox',
      version: 1,
      userId: 'user_1',
    });
    const response = await POST(request, { params });

    expect(mockChangeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalText: null,
      }),
    });
  });

  it('should store originalText spanning multiple deleted nodes', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The quick brown fox',
      version: 1,
      nodeIds: ['n1', 'n2', 'n3', 'n4'],
    });

    mockNodeFindMany.mockResolvedValue(mockNodes);

    mockComputeChanges.mockReturnValue([
      {
        type: 'replace',
        deleteIds: ['n2', 'n3'],
        afterId: 'n1',
        newText: 'slow ',
      },
    ]);

    mockChangeCreate.mockResolvedValue({
      id: 'ch_1',
      type: 'replace',
      status: 'pending',
      deleteIds: JSON.stringify(['n2', 'n3']),
      afterId: 'n1',
      newText: 'slow ',
      originalText: 'quick brown ',
      documentId: 'doc_1',
      userId: 'user_1',
    });

    const { request, params } = makePostRequest('doc_1', {
      text: 'The slow fox',
      version: 1,
      userId: 'user_1',
    });
    const response = await POST(request, { params });

    expect(mockChangeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalText: 'quick brown ',
      }),
    });
  });

  it('should return 400 if text is missing', async () => {
    const { request, params } = makePostRequest('doc_1', {
      version: 1,
      userId: 'user_1',
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing 'text' field");
  });

  it('should return 400 if version is missing', async () => {
    const { request, params } = makePostRequest('doc_1', {
      text: 'hello',
      userId: 'user_1',
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing 'version' field");
  });

  it('should return 400 if userId is missing', async () => {
    const { request, params } = makePostRequest('doc_1', {
      text: 'hello',
      version: 1,
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing 'userId' field");
  });

  it('should return 409 on version mismatch', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The quick brown fox',
      version: 2,
      nodeIds: ['n1', 'n2', 'n3', 'n4'],
    });

    const { request, params } = makePostRequest('doc_1', validBody);
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('Version mismatch');
    expect(data.currentVersion).toBe(2);
  });

  it('should return early if no changes detected', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The quick brown fox',
      version: 1,
      nodeIds: ['n1', 'n2', 'n3', 'n4'],
    });

    const { request, params } = makePostRequest('doc_1', {
      text: 'The quick brown fox',
      version: 1,
      userId: 'user_1',
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.changes).toBe(0);
    expect(mockComputeChanges).not.toHaveBeenCalled();
  });

  it('should store multiple pending changes for multiple diffs', async () => {
    mockGetDocumentText.mockResolvedValue({
      text: 'The quick brown fox',
      version: 1,
      nodeIds: ['n1', 'n2', 'n3', 'n4'],
    });

    mockNodeFindMany.mockResolvedValue(mockNodes);

    mockComputeChanges.mockReturnValue([
      { type: 'replace', deleteIds: ['n2'], afterId: 'n1', newText: 'slow ' },
      { type: 'replace', deleteIds: ['n4'], afterId: 'n3', newText: 'cat' },
    ]);

    let createCount = 0;
    mockChangeCreate.mockImplementation((args: any) => {
      createCount++;
      return Promise.resolve({
        id: `ch_${createCount}`,
        ...args.data,
      });
    });

    const { request, params } = makePostRequest('doc_1', {
      text: 'The slow brown cat',
      version: 1,
      userId: 'user_1',
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.changes).toBe(2);
    expect(data.pending).toHaveLength(2);
    expect(mockChangeCreate).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/documents/:id/changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return pending changes with originalText', async () => {
    const changes = [
      {
        id: 'ch_1',
        type: 'replace',
        status: 'pending',
        deleteIds: JSON.stringify(['n2']),
        afterId: 'n1',
        newText: 'slow ',
        originalText: 'quick ',
        user: { name: 'Alice' },
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];
    mockChangeFindMany.mockResolvedValue(changes);

    const { request, params } = makeGetRequest('doc_1');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe('pending');
    expect(data[0].originalText).toBe('quick ');
    expect(data[0].newText).toBe('slow ');
    expect(data[0].user.name).toBe('Alice');
  });

  it('should return empty array when no pending changes', async () => {
    mockChangeFindMany.mockResolvedValue([]);

    const { request, params } = makeGetRequest('doc_1');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('should return 500 on error', async () => {
    mockChangeFindMany.mockRejectedValue(new Error('DB error'));

    const { request, params } = makeGetRequest('doc_1');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch changes');
  });
});
