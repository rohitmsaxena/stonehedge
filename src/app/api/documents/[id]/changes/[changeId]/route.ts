import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyChanges } from '@/lib/services/change.service';
import { updateIndexForDocument } from '@/lib/services/search.service';

/**
 * PATCH /api/documents/:id/changes/:changeId
 * Approve or reject a pending change.
 *
 * Body: { action: "approve" | "reject" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; changeId: string }> }
) {
  const { id, changeId } = await params;

  try {
    const body = await request.json();
    const { action } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'reject'.", code: 400 },
        { status: 400 }
      );
    }

    const change = await prisma.change.findUnique({
      where: { id: changeId },
    });

    if (!change || change.documentId !== id) {
      return NextResponse.json(
        { error: 'Change not found', code: 404 },
        { status: 404 }
      );
    }

    if (change.status !== 'pending') {
      return NextResponse.json(
        { error: `Change is already ${change.status}`, code: 400 },
        { status: 400 }
      );
    }

    if (action === 'reject') {
      await prisma.change.update({
        where: { id: changeId },
        data: { status: 'rejected' },
      });

      console.log(`[PATCH] Change ${changeId} rejected`);

      return NextResponse.json({ id: changeId, status: 'rejected' });
    }

    // Approve — apply the change to CharNodes
    console.log(`[PATCH] Approving change ${changeId}`);

    const operation = {
      type: change.type as 'insert' | 'delete' | 'replace',
      deleteIds: JSON.parse(change.deleteIds),
      afterId: change.afterId,
      newText: change.newText ?? undefined,
    };

    await applyChanges(id, [operation], change.userId);
    await updateIndexForDocument(id);

    await prisma.change.update({
      where: { id: changeId },
      data: { status: 'accepted' },
    });

    console.log(`[PATCH] Change ${changeId} approved and applied`);

    return NextResponse.json({ id: changeId, status: 'accepted' });
  } catch (error) {
    console.error(`[PATCH] Error:`, error);
    return NextResponse.json(
      { error: 'Failed to process change', code: 500 },
      { status: 500 }
    );
  }
}
