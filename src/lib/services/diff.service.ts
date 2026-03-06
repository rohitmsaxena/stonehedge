import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

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

interface NodePosition {
  nodeIndex: number;
  start: number;
  end: number;
}

/**
 * Build a position map from node contents.
 */
function buildPositionMap(nodeContents: string[]): NodePosition[] {
  const map: NodePosition[] = [];
  let pos = 0;
  for (let i = 0; i < nodeContents.length; i++) {
    const len = nodeContents[i].length;
    map.push({ nodeIndex: i, start: pos, end: pos + len });
    pos += len;
  }
  console.log('[buildPositionMap] Position map:', JSON.stringify(map));
  return map;
}

/**
 * Find which node a character position falls within.
 */
function getNodeAtPosition(posMap: NodePosition[], pos: number): number | null {
  for (const entry of posMap) {
    if (pos >= entry.start && pos < entry.end) {
      return entry.nodeIndex;
    }
  }
  return null;
}

/**
 * Diff the original visible text against the new edited text.
 * Maps character-level diffs to word-node-level operations.
 *
 * Approach:
 * 1. Compute character-level diffs
 * 2. Mark which nodes are "dirty" (touched by any insert/delete)
 * 3. Group contiguous dirty nodes
 * 4. For each group, map the original range to the new text range
 * 5. Produce replace/delete/insert operations at the node level
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
    console.log('[computeChanges] No nodes, returning empty');
    return [];
  }

  const diffs = dmp.diff_main(originalText, newText);
  dmp.diff_cleanupSemantic(diffs);

  console.log('[computeChanges] Diffs after cleanup:', JSON.stringify(diffs));

  const posMap = buildPositionMap(nodeContents);

  // Step 1: Mark dirty nodes
  const dirtyNodes = new Set<number>();
  let origPos = 0;

  for (const [op, text] of diffs) {
    if (op === 0) {
      origPos += text.length;
    } else if (op === -1) {
      const start = origPos;
      const end = origPos + text.length;
      for (const entry of posMap) {
        if (entry.end > start && entry.start < end) {
          dirtyNodes.add(entry.nodeIndex);
        }
      }
      origPos += text.length;
    } else if (op === 1) {
      let nodeIdx = getNodeAtPosition(posMap, origPos);
      if (nodeIdx === null && origPos > 0) {
        nodeIdx = getNodeAtPosition(posMap, origPos - 1);
      }
      if (nodeIdx !== null) {
        dirtyNodes.add(nodeIdx);
      }
    }
  }

  console.log('[computeChanges] Dirty node indices:', [...dirtyNodes]);

  if (dirtyNodes.size === 0) {
    console.log('[computeChanges] No dirty nodes, returning empty');
    return [];
  }

  // Step 2: Group contiguous dirty nodes
  const sortedDirty = [...dirtyNodes].sort((a, b) => a - b);
  const groups: number[][] = [];
  let currentGroup: number[] = [sortedDirty[0]];

  for (let i = 1; i < sortedDirty.length; i++) {
    if (sortedDirty[i] === currentGroup[currentGroup.length - 1] + 1) {
      currentGroup.push(sortedDirty[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sortedDirty[i]];
    }
  }
  groups.push(currentGroup);

  console.log('[computeChanges] Dirty node groups:', JSON.stringify(groups));

  // Step 3: For each group, map original range to new text range
  const operations: ChangeOperation[] = [];

  for (const group of groups) {
    const firstIdx = group[0];
    const lastIdx = group[group.length - 1];

    const groupOriginal = group.map((idx) => nodeContents[idx]).join('');
    const groupStart = posMap[firstIdx].start;
    const groupEnd = posMap[lastIdx].end;

    // Walk diffs to map [groupStart, groupEnd) in original to a range in new text.
    let oPos = 0;
    let nPos = 0;
    let newStart: number | null = null;
    let newEnd: number | null = null;
    let justFinishedGroupDelete = false;

    for (const [diffOp, diffText] of diffs) {
      if (diffOp === 0) {
        // Equal segment
        if (newStart === null && oPos + diffText.length > groupStart) {
          newStart = nPos + (groupStart - oPos);
        }
        if (newEnd === null && oPos + diffText.length >= groupEnd) {
          newEnd = nPos + (groupEnd - oPos);
        }
        oPos += diffText.length;
        nPos += diffText.length;
        justFinishedGroupDelete = false;
      } else if (diffOp === -1) {
        // Delete segment
        if (newStart === null && oPos + diffText.length > groupStart) {
          newStart = nPos;
        }
        if (newEnd === null && oPos + diffText.length >= groupEnd) {
          newEnd = nPos;
          justFinishedGroupDelete = true;
        }
        oPos += diffText.length;
      } else if (diffOp === 1) {
        // Insert segment
        if (newStart === null && oPos >= groupStart) {
          newStart = nPos;
        }
        // Extend newEnd if this insert is at or within the group boundary
        // Covers: delete+insert (replace) and pure insert at node edge
        if (
          justFinishedGroupDelete ||
          (newEnd !== null && oPos >= groupStart && oPos <= groupEnd)
        ) {
          newEnd = nPos + diffText.length;
        }
        nPos += diffText.length;
        justFinishedGroupDelete = false;
      }
    }

    if (newStart === null) newStart = nPos;
    if (newEnd === null) newEnd = nPos;

    const groupNew = newText.slice(newStart, newEnd);
    const deleteIds = group.map((idx) => nodeIds[idx]);
    const afterId = firstIdx > 0 ? nodeIds[firstIdx - 1] : null;

    console.log(`[computeChanges] Group: nodes ${firstIdx}-${lastIdx}`);
    console.log(`[computeChanges]   Original: "${groupOriginal}"`);
    console.log(`[computeChanges]   New:      "${groupNew}"`);
    console.log(`[computeChanges]   newStart: ${newStart}, newEnd: ${newEnd}`);
    console.log(`[computeChanges]   deleteIds: ${deleteIds}`);
    console.log(`[computeChanges]   afterId: ${afterId}`);

    if (groupNew.length === 0) {
      operations.push({
        type: 'delete',
        deleteIds,
        afterId: null,
      });
    } else if (groupOriginal === groupNew) {
      console.log('[computeChanges]   Skipping — text unchanged after snap');
    } else {
      operations.push({
        type: 'replace',
        deleteIds,
        afterId,
        newText: groupNew,
      });
    }
  }

  console.log(
    '[computeChanges] Final operations:',
    JSON.stringify(operations, null, 2)
  );
  return operations;
}
