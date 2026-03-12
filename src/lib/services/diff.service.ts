import { diffArrays } from 'diff';
import { splitIntoWords } from './change.service';

/**
 * Represents a single change operation mapped to CharNodes.
 */
export interface ChangeOperation {
  type: 'insert' | 'delete' | 'replace';
  /** IDs of nodes being removed (delete/replace) */
  deleteIds: string[];
  /** ID of the node to insert after (insert/replace) */
  afterId: string | null;
  /** New text to insert (insert/replace) */
  newText?: string;
}

/**
 * Diff the original visible text against the new edited text.
 * Maps word-level diffs directly to node-level operations.
 *
 * Approach:
 * 1. Split new text into words using splitIntoWords (nodeContents already represents the old words)
 * 2. Use diffArrays to compare old words vs new words
 * 3. Map removed/added word groups directly to delete/insert/replace operations
 */
export function computeChanges(
  originalText: string,
  newText: string,
  nodeIds: string[],
  nodeContents: string[]
): ChangeOperation[] {
  console.log('[computeChanges] Original text:', JSON.stringify(originalText));
  console.log('[computeChanges] New text:', JSON.stringify(newText));
  console.log('[computeChanges] Node IDs:', nodeIds);
  console.log('[computeChanges] Node contents:', nodeContents);

  if (nodeIds.length === 0) {
    if (newText.length > 0) {
      console.log('[computeChanges] No nodes, inserting all new text');
      return [
        {
          type: 'insert',
          deleteIds: [],
          afterId: null,
          newText,
        },
      ];
    }
    console.log('[computeChanges] No nodes and no new text, returning empty');
    return [];
  }

  const oldWords = nodeContents;
  const newWords = splitIntoWords(newText);

  const diffs = diffArrays(oldWords, newWords);

  console.log('[computeChanges] Word-level diffs:', JSON.stringify(diffs));

  const operations: ChangeOperation[] = [];
  let oldIndex = 0;

  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i];

    if (!part.added && !part.removed) {
      // Equal — advance through old nodes
      oldIndex += part.count!;
    } else if (part.removed) {
      const deleteIds = nodeIds.slice(oldIndex, oldIndex + part.count!);
      const afterId = oldIndex > 0 ? nodeIds[oldIndex - 1] : null;

      // Check if next part is an addition (replace)
      const nextPart = diffs[i + 1];
      if (nextPart && nextPart.added) {
        operations.push({
          type: 'replace',
          deleteIds,
          afterId,
          newText: nextPart.value.join(''),
        });
        i++; // Skip the added part
      } else {
        operations.push({
          type: 'delete',
          deleteIds,
          afterId: null,
        });
      }
      oldIndex += part.count!;
    } else if (part.added) {
      // Pure insert (no preceding remove)
      const afterId = oldIndex > 0 ? nodeIds[oldIndex - 1] : null;
      operations.push({
        type: 'insert',
        deleteIds: [],
        afterId,
        newText: part.value.join(''),
      });
    }
  }

  console.log(
    '[computeChanges] Final operations:',
    JSON.stringify(operations, null, 2)
  );
  return operations;
}
