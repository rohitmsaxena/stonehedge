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
 * Invariant: every node's content corresponds to exactly one
 * splitIntoWords token, so nodeContents IS the old word array
 * and word indices map 1:1 to node indices.
 */
export function computeChanges(
  newText: string,
  nodeIds: string[],
  nodeContents: string[]
): ChangeOperation[] {
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

  const newWords = splitIntoWords(newText);

  // nodeContents are already the old words (1:1 with nodes)
  const diffs = diffArrays(nodeContents, newWords);

  console.log('[computeChanges] Word-level diffs:', JSON.stringify(diffs));

  const operations: ChangeOperation[] = [];
  let oldIdx = 0;

  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i];

    if (!part.added && !part.removed) {
      // Equal — advance
      oldIdx += part.value.length;
    } else if (part.removed) {
      const deleteIds = nodeIds.slice(oldIdx, oldIdx + part.value.length);
      const afterId = oldIdx > 0 ? nodeIds[oldIdx - 1] : null;

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
      oldIdx += part.value.length;
    } else if (part.added) {
      // Pure insert — find the node to insert after
      const afterId = oldIdx > 0 ? nodeIds[oldIdx - 1] : null;
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
