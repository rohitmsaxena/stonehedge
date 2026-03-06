import { NextRequest, NextResponse } from 'next/server';
import { getDocumentText } from '@/lib/services/document.service';
import { computeChanges } from '@/lib/services/diff.service';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/documents/:id/changes
 * Computes diffs and stores them as pending changes. Does NOT apply them.
 *
 * Body: { text: string, version: number, userId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { text: newText, version, userId } = body;

    if (!version) {
      return NextResponse.json(
        { error: "Missing 'version' field", code: 400 },
        { status: 400 }
      );
    }
    if (!userId) {
      return NextResponse.json(
        { error: "Missing 'userId' field", code: 400 },
        { status: 400 }
      );
    }

    console.log(
      `[POST /api/documents/${id}/changes] Received edit, version ${version}`
    );

    const current = await getDocumentText(id);

    if (current.version !== version) {
      console.log(`[POST /api/documents/${id}/changes] Version mismatch!!`);
      return NextResponse.json(
        {
          error: 'Version mismatch. Please refresh and try again.',
          code: 409,
          currentVersion: current.version,
        },
        { status: 409 }
      );
    }

    if (current.text === newText) {
      console.log(`[POST /api/documents/${id}/changes] No changes detected!`);
      return NextResponse.json({ id, changes: 0 });
    }

    // Get ordered visible nodes for diff mapping
    const nodes = await prisma.charNode.findMany({
      where: { documentId: id, deleted: false },
    });

    // For each node, create a [key, value] pair where the key is afterId and the value is the node itself
    const nodeMap = new Map(nodes.map((n) => [n.afterId, n]));
    const ordered: typeof nodes = [];
    let curr = nodeMap.get(null) ?? null;
    while (curr) {
      ordered.push(curr);
      curr = nodeMap.get(curr.id) ?? null;
    }

    const nodeIds = ordered.map((n) => n.id);
    const nodeContents = ordered.map((n) => n.content);

    // Compute diffs
    const operations = computeChanges(
      current.text,
      newText,
      nodeIds,
      nodeContents
    );

    console.log(
      `[POST /api/documents/${id}/changes] Computed ${operations.length} operations`
    );

    // Store each operation as a pending Change
    const pendingChanges = [];
    for (const op of operations) {
      // Look up original text for delete/replace operations
      let originalText: string | null = null;
      if (op.deleteIds.length > 0) {
        const deletedNodes = ordered.filter((n) => op.deleteIds.includes(n.id));
        originalText = deletedNodes.map((n) => n.content).join('');
      }

      const change = await prisma.change.create({
        data: {
          type: op.type,
          status: 'pending',
          deleteIds: JSON.stringify(op.deleteIds),
          afterId: op.afterId,
          newText: op.newText,
          originalText,
          documentId: id,
          userId,
        },
      });
      pendingChanges.push(change);
    }

    console.log(
      `[POST /api/documents/${id}/changes] Created ${pendingChanges.length} pending changes`
    );

    return NextResponse.json({
      id,
      changes: pendingChanges.length,
      pending: pendingChanges,
    });
  } catch (error) {
    console.error(`[POST /api/documents/${id}/changes] Error:`, error);
    return NextResponse.json(
      { error: 'Failed to compute changes', code: 500 },
      { status: 500 }
    );
  }
}

/**
 * GET /api/documents/:id/changes
 * Returns all pending changes for a document.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const changes = await prisma.change.findMany({
      where: { documentId: id, status: 'pending' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(changes);
  } catch (error) {
    console.error(`[GET /api/documents/${id}/changes] Error:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch changes', code: 500 },
      { status: 500 }
    );
  }
}
