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
  const regex = /(\s*\S+\s*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    words.push(match[1]);
  }
  // Capture any trailing whitespace-only remainder not matched by the regex
  const joined = words.join('');
  if (joined.length < text.length) {
    const remainder = text.slice(joined.length);
    if (remainder.length > 0) {
      if (words.length > 0) {
        words[words.length - 1] += remainder;
      } else {
        words.push(remainder);
      }
    }
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
      // Find the node that comes after the last deleted node BEFORE tombstoning,
      // so we can restitch it to point past the deleted range.
      const lastDeletedId = op.deleteIds[op.deleteIds.length - 1];
      const firstDeletedId = op.deleteIds[0];
      const firstDeleted = await prisma.charNode.findFirst({
        where: { id: firstDeletedId },
      });
      const nodeAfterDeletedRange = await prisma.charNode.findFirst({
        where: { afterId: lastDeletedId, documentId },
      });

      await prisma.charNode.updateMany({
        where: { id: { in: op.deleteIds } },
        data: { deleted: true },
      });

      // Restitch: the node after the deleted range should point to
      // whatever the first deleted node was pointing after (i.e., skip over the deleted range)
      if (nodeAfterDeletedRange && firstDeleted) {
        await prisma.charNode.update({
          where: { id: nodeAfterDeletedRange.id },
          data: { afterId: firstDeleted.afterId },
        });
        console.log(
          `[applyChanges] Restitched after delete: node ${nodeAfterDeletedRange.id} now after ${firstDeleted.afterId}`
        );
      }
      console.log(`[applyChanges] Tombstoned nodes: ${op.deleteIds}`);
    } else if (op.type === 'insert') {
      await insertNodes(op.afterId, op.newText!, documentId);
    } else if (op.type === 'replace') {
      // BEFORE tombstoning, find the node that comes after the last deleted node.
      // After tombstoning, this lookup would fail because insertNodes
      // queries for non-deleted nodes with a matching afterId.
      const lastDeletedId = op.deleteIds[op.deleteIds.length - 1];
      const nodeAfterDeletedRange = await prisma.charNode.findFirst({
        where: { afterId: lastDeletedId, documentId },
      });

      console.log(
        `[applyChanges] Node after deleted range: ${nodeAfterDeletedRange?.id ?? 'none'}`
      );

      // Tombstone the deleted nodes
      await prisma.charNode.updateMany({
        where: { id: { in: op.deleteIds } },
        data: { deleted: true },
      });
      console.log(
        `[applyChanges] Tombstoned nodes for replace: ${op.deleteIds}`
      );

      // Insert new nodes without restitching — we handle it ourselves
      const lastInsertedId = await insertNodesRaw(
        op.afterId,
        op.newText!,
        documentId
      );

      // Restitch: the node after the deleted range now points to the last inserted node
      if (nodeAfterDeletedRange && lastInsertedId) {
        await prisma.charNode.update({
          where: { id: nodeAfterDeletedRange.id },
          data: { afterId: lastInsertedId },
        });
        console.log(
          `[applyChanges] Restitched: node ${nodeAfterDeletedRange.id} now after ${lastInsertedId}`
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
 * Finds what currently comes after the insertion point,
 * creates new nodes, and restitches the chain.
 * Used for pure inserts where no tombstoning happened.
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

/**
 * Insert new word-level CharNodes without restitching.
 * Used by replace operations which handle restitch themselves
 * because the "next node" must be found before tombstoning.
 * Returns the ID of the last inserted node.
 */
async function insertNodesRaw(
  afterId: string | null,
  text: string,
  documentId: string
): Promise<string | null> {
  const words = splitIntoWords(text);
  if (words.length === 0) return afterId;

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
      `[insertNodesRaw] Created node ${newNode.id}: "${word}" after ${prevId}`
    );
    prevId = newNode.id;
  }

  return prevId;
}
