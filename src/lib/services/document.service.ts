import { prisma } from '@/lib/prisma';

// Simple in-memory cache: documentId -> { text, version }
const cache = new Map<
  string,
  { text: string; version: number; nodeIds: string[] }
>();

/**
 * Walk the linked list of CharNodes and return them in order.
 * Starts from the node with afterId === null (head), follows the chain.
 */
export async function getOrderedNodes(documentId: string) {
  const nodes = await prisma.charNode.findMany({
    where: { documentId },
  });

  // Build a map: afterId -> node (which node comes after which)
  const afterMap = new Map<string | null, (typeof nodes)[number]>();
  for (const node of nodes) {
    afterMap.set(node.afterId, node);
  }

  // Walk the linked list starting from head (afterId === null)
  const ordered: typeof nodes = [];
  let current = afterMap.get(null);
  while (current) {
    ordered.push(current);

    current = afterMap.get(current.id);
  }

  return ordered;
}

/**
 * Build the visible string from ordered CharNodes.
 * Skips deleted (tombstoned) nodes.
 */
export function buildVisibleText(
  nodes: { content: string; deleted: boolean }[]
) {
  return nodes
    .filter((n) => !n.deleted)
    .map((n) => n.content)
    .join('');
}

/**
 * Get a document's visible text, using cache when possible.
 * Returns the text, version, and ordered visible node IDs (for diff mapping).
 */
export async function getDocumentText(documentId: string) {
  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
  });

  const cached = cache.get(documentId);
  if (cached && cached.version === doc.version) {
    return cached;
  }

  // Cache miss — rebuild
  const ordered = await getOrderedNodes(documentId);
  const visible = ordered.filter((n) => !n.deleted);
  const text = visible.map((n) => n.content).join('');
  const nodeIds = visible.map((n) => n.id);

  const entry = { text, version: doc.version, nodeIds };
  cache.set(documentId, entry);

  return entry;
}

/**
 * Invalidate cache for a document (call after mutations).
 */
export function invalidateCache(documentId: string) {
  cache.delete(documentId);
}
