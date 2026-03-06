import { prisma } from '../prisma';
import { ChangeOperation } from './diff.service';
import { invalidateCache } from './document.service';

/**
 * Split a string into word-level CharNode chunks.
 * Preserves trailing whitespace on each word.
 * e.g. "The quick fox" -> ["The ", "quick ", "fox"]
 */
export function splitIntoWords(text: string): string[] {
  const words: string[] = [];
  const regex = /(\S+\s*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    words.push(match[1]);
  }
  console.log(`[splitIntoWords] "${text}" -> ${JSON.stringify(words)}`);
  return words;
}

/**
 * Apply a set of change operations to a document's CharNodes.
 * Does NOT create Change records — those are managed separately.
 * - Tombstones deleted nodes
 * - Creates new nodes for inserts/replacements
 * - Updates the linked list (afterId pointers)
 * - Bumps the document version
 */
export async function applyChanges(
  documentId: string,
  operations: ChangeOperation[],
  userId: string
): Promise<void> {
  console.log(
    `[applyChanges] Applying ${operations.length} operations to document ${documentId}`
  );

  for (const op of operations) {
    console.log(`[applyChanges] Processing operation:`, JSON.stringify(op));

    if (op.type === 'delete') {
      // Tombstone the target nodes
      await prisma.charNode.updateMany({
        where: { id: { in: op.deleteIds } },
        data: { deleted: true },
      });
      console.log(`[applyChanges] Tombstoned nodes: ${op.deleteIds}`);
    } else if (op.type === 'insert') {
      await insertNodes(op.afterId, op.newText!, documentId);
    } else if (op.type === 'replace') {
      // Find the first deleted node
      const firstDeletedNode = await prisma.charNode.findUnique({
        where: { id: op.deleteIds[0] },
      });

      if (!firstDeletedNode) {
        console.error(
          `[applyChanges] Could not find first deleted node: ${op.deleteIds[0]}`
        );
        continue;
      }

      // Find the last deleted node to know what comes after
      const lastDeletedNode = await prisma.charNode.findUnique({
        where: { id: op.deleteIds[op.deleteIds.length - 1] },
      });

      // Find the node that comes after the last deleted node
      const nodeAfterDeleted = lastDeletedNode
        ? await prisma.charNode.findFirst({
            where: { afterId: lastDeletedNode.id, documentId },
          })
        : null;

      // Tombstone the deleted nodes
      await prisma.charNode.updateMany({
        where: { id: { in: op.deleteIds } },
        data: { deleted: true },
      });
      console.log(
        `[applyChanges] Tombstoned nodes for replace: ${op.deleteIds}`
      );

      // Insert new nodes after the node before the first deleted
      const lastInsertedId = await insertNodes(
        op.afterId,
        op.newText!,
        documentId
      );

      // Stitch: the node that was after the deleted range now points to the last inserted node
      if (nodeAfterDeleted && lastInsertedId) {
        await prisma.charNode.update({
          where: { id: nodeAfterDeleted.id },
          data: { afterId: lastInsertedId },
        });
        console.log(
          `[applyChanges] Stitched: node ${nodeAfterDeleted.id} now after ${lastInsertedId}`
        );
      }
    }
  }

  // Bump document version
  await prisma.document.update({
    where: { id: documentId },
    data: { version: { increment: 1 } },
  });

  // Invalidate the cache so next read rebuilds
  invalidateCache(documentId);

  console.log(`[applyChanges] Done. Version incremented, cache invalidated.`);
}

/**
 * Insert new word-level CharNodes into the linked list.
 * Returns the ID of the last inserted node.
 */
async function insertNodes(
  afterId: string | null,
  text: string,
  documentId: string
): Promise<string | null> {
  const words = splitIntoWords(text);
  if (words.length === 0) return afterId;

  // Find the node that currently comes after our insertion point
  const nodeAfterInsert = await prisma.charNode.findFirst({
    where: { afterId, documentId, deleted: false },
  });

  let prevId = afterId;

  for (const word of words) {
    const newNode = await prisma.charNode.create({
      data: {
        content: word,
        documentId,
        afterId: prevId,
      },
    });
    console.log(
      `[insertNodes] Created node ${newNode.id}: "${word}" after ${prevId}`
    );
    prevId = newNode.id;
  }

  // Restitch: whatever was after the insertion point now comes after the last new node
  if (nodeAfterInsert) {
    await prisma.charNode.update({
      where: { id: nodeAfterInsert.id },
      data: { afterId: prevId },
    });
    console.log(
      `[insertNodes] Restitched: node ${nodeAfterInsert.id} now after ${prevId}`
    );
  }

  return prevId;
}
