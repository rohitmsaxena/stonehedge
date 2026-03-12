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
 * Maps word-level diffs to node-level operations.
 *
 * Approach:
 * 1. Split both texts with splitIntoWords for consistent word boundaries
 * 2. Use diffArrays to compare the two word arrays
 * 3. Map changed word ranges to node ranges via character positions
 *
 * Using splitIntoWords on both sides (rather than nodeContents directly)
 * ensures the diff works correctly even if nodes were created with a
 * different word-splitting method.
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

  // Split both texts with the same function for consistent word boundaries
  const oldWords = splitIntoWords(originalText);
  const newWords = splitIntoWords(newText);

  const diffs = diffArrays(oldWords, newWords);

  console.log('[computeChanges] Word-level diffs:', JSON.stringify(diffs));

  // Build character offset maps for old words and nodes
  const oldWordOffsets = buildOffsets(oldWords);
  const nodeOffsets = buildOffsets(nodeContents);

  const operations: ChangeOperation[] = [];
  let oldWordIdx = 0;

  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i];

    if (!part.added && !part.removed) {
      // Equal — advance
      oldWordIdx += part.value.length;
    } else if (part.removed) {
      // Character range of removed words
      const charStart = oldWordOffsets[oldWordIdx].start;
      const charEnd = oldWordOffsets[oldWordIdx + part.value.length - 1].end;

      // Map character range to overlapping nodes
      const affectedIndices = getOverlappingNodes(
        nodeOffsets,
        charStart,
        charEnd
      );
      const deleteIds = affectedIndices.map((idx) => nodeIds[idx]);
      const firstNodeIdx = affectedIndices[0];
      const afterId = firstNodeIdx > 0 ? nodeIds[firstNodeIdx - 1] : null;

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
      oldWordIdx += part.value.length;
    } else if (part.added) {
      // Pure insert — find the node to insert after
      let afterId: string | null = null;
      if (oldWordIdx > 0) {
        const prevCharPos = oldWordOffsets[oldWordIdx - 1].end - 1;
        const nodeIdx = getNodeAtChar(nodeOffsets, prevCharPos);
        if (nodeIdx !== null) {
          afterId = nodeIds[nodeIdx];
        }
      }
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

function buildOffsets(items: string[]): { start: number; end: number }[] {
  const offsets: { start: number; end: number }[] = [];
  let pos = 0;
  for (const item of items) {
    offsets.push({ start: pos, end: pos + item.length });
    pos += item.length;
  }
  return offsets;
}

function getOverlappingNodes(
  nodeOffsets: { start: number; end: number }[],
  charStart: number,
  charEnd: number
): number[] {
  const result: number[] = [];
  for (let i = 0; i < nodeOffsets.length; i++) {
    if (nodeOffsets[i].end > charStart && nodeOffsets[i].start < charEnd) {
      result.push(i);
    }
  }
  return result;
}

function getNodeAtChar(
  nodeOffsets: { start: number; end: number }[],
  charPos: number
): number | null {
  for (let i = 0; i < nodeOffsets.length; i++) {
    if (charPos >= nodeOffsets[i].start && charPos < nodeOffsets[i].end) {
      return i;
    }
  }
  return null;
}
