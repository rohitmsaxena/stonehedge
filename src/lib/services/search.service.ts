import { prisma } from '../prisma';
import { getDocumentText } from './document.service';

/**
 * In-memory inverted index.
 * Maps each word (lowercased) to a set of document IDs that contain it.
 */
const invertedIndex = new Map<string, Set<string>>();

/**
 * Maps documentId to { text, title } for snippet extraction.
 */
const documentCache = new Map<string, { text: string; title: string }>();

let indexBuilt = false;

/**
 * Tokenize text into lowercase words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 0);
}

/**
 * Build the inverted index from all documents.
 * Call once on startup or after significant changes.
 */
export async function buildIndex(): Promise<void> {
  console.time('[buildIndex]');

  invertedIndex.clear();
  documentCache.clear();

  const documents = await prisma.document.findMany({
    select: { id: true, title: true },
  });

  for (const doc of documents) {
    const { text } = await getDocumentText(doc.id);
    documentCache.set(doc.id, { text, title: doc.title });

    const words = tokenize(text);
    for (const word of words) {
      if (!invertedIndex.has(word)) {
        invertedIndex.set(word, new Set());
      }
      invertedIndex.get(word)!.add(doc.id);
    }
  }

  indexBuilt = true;
  console.timeEnd('[buildIndex]');
  console.log(
    `[buildIndex] Indexed ${invertedIndex.size} unique words across ${documents.length} documents`
  );
}

/**
 * Update the index for a single document.
 * Call after a change is approved.
 */
export async function updateIndexForDocument(
  documentId: string
): Promise<void> {
  console.log(`[updateIndex] Updating index for document ${documentId}`);

  // Remove old entries for this document
  for (const [, docIds] of invertedIndex) {
    docIds.delete(documentId);
  }

  // Get fresh text
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { title: true },
  });

  if (!doc) return;

  const { text } = await getDocumentText(documentId);
  documentCache.set(documentId, { text, title: doc.title });

  const words = tokenize(text);
  for (const word of words) {
    if (!invertedIndex.has(word)) {
      invertedIndex.set(word, new Set());
    }
    invertedIndex.get(word)!.add(documentId);
  }
}

/**
 * Search the inverted index.
 * Returns documents that contain ALL query words (AND search).
 */
export async function searchDocuments(
  query: string,
  limit: number = 10,
  offset: number = 0
): Promise<{
  matches: {
    documentId: string;
    documentTitle: string;
    snippet: string;
    position: number;
  }[];
  total: number;
}> {
  // Build index on first search
  if (!indexBuilt) {
    await buildIndex();
  }

  const queryWords = tokenize(query);
  console.log(`[search] Query words: ${queryWords}`);

  if (queryWords.length === 0) {
    return { matches: [], total: 0 };
  }

  // Find documents that contain ALL query words
  let candidateDocIds: Set<string> | null = null;

  for (const word of queryWords) {
    const docIds = invertedIndex.get(word);
    if (!docIds || docIds.size === 0) {
      // A query word isn't in any document — no results
      return { matches: [], total: 0 };
    }
    if (candidateDocIds === null) {
      candidateDocIds = new Set(docIds);
    } else {
      // Intersect
      for (const id of candidateDocIds) {
        if (!docIds.has(id)) {
          candidateDocIds.delete(id);
        }
      }
    }
  }

  if (!candidateDocIds || candidateDocIds.size === 0) {
    return { matches: [], total: 0 };
  }

  console.log(`[search] Found ${candidateDocIds.size} candidate documents`);

  // Extract snippets from candidate documents
  const contextChars = 40;
  const lowerQuery = query.toLowerCase();
  const allMatches: {
    documentId: string;
    documentTitle: string;
    snippet: string;
    position: number;
  }[] = [];

  for (const docId of candidateDocIds) {
    const cached = documentCache.get(docId);
    if (!cached) continue;

    const { text, title } = cached;
    const lowerText = text.toLowerCase();

    // Try exact phrase match first
    let searchFrom = 0;
    let foundExact = false;
    while (true) {
      const pos = lowerText.indexOf(lowerQuery, searchFrom);
      if (pos === -1) break;
      foundExact = true;

      const start = Math.max(0, pos - contextChars);
      const end = Math.min(text.length, pos + query.length + contextChars);
      const snippet =
        (start > 0 ? '...' : '') +
        text.slice(start, end) +
        (end < text.length ? '...' : '');

      allMatches.push({
        documentId: docId,
        documentTitle: title,
        snippet,
        position: pos,
      });
      searchFrom = pos + 1;
    }

    // If no exact phrase match, find snippets for each query word
    if (!foundExact) {
      for (const word of queryWords) {
        searchFrom = 0;
        while (true) {
          const pos = lowerText.indexOf(word, searchFrom);
          if (pos === -1) break;

          const start = Math.max(0, pos - contextChars);
          const end = Math.min(text.length, pos + word.length + contextChars);
          const snippet =
            (start > 0 ? '...' : '') +
            text.slice(start, end) +
            (end < text.length ? '...' : '');

          allMatches.push({
            documentId: docId,
            documentTitle: title,
            snippet,
            position: pos,
          });
          searchFrom = pos + 1;
        }
      }
    }
  }

  const paginated = allMatches.slice(offset, offset + limit);

  return {
    matches: paginated,
    total: allMatches.length,
  };
}

/**
 * Reset the index (for testing).
 */
export function resetIndex(): void {
  invertedIndex.clear();
  documentCache.clear();
  indexBuilt = false;
}
