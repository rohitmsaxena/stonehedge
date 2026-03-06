import { computeChanges } from './diff.service';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('diff.service', () => {
  describe('computeChanges', () => {
    it('should detect a single word replacement', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['The ', 'quick ', 'fox'];
      const original = 'The quick fox';
      const edited = 'The slow fox';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('slow ');
    });

    it('should detect a pure deletion', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['The ', 'quick ', 'fox'];
      const original = 'The quick fox';
      const edited = 'The fox';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].deleteIds).toEqual(['n2']);
    });

    it('should return no changes when text is identical', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];
      const original = 'Hello world';

      const changes = computeChanges(original, original, nodeIds, nodeContents);

      expect(changes).toHaveLength(0);
    });

    it('should detect multiple changes in different sections', () => {
      const nodeIds = ['n1', 'n2', 'n3', 'n4', 'n5'];
      const nodeContents = ['The ', 'quick ', 'brown ', 'fox ', 'jumped'];
      const original = 'The quick brown fox jumped';
      const edited = 'The slow brown cat jumped';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes.length).toBeGreaterThanOrEqual(2);

      const allDeletedIds = changes.flatMap((c) => c.deleteIds);
      expect(allDeletedIds).toContain('n2');
      expect(allDeletedIds).toContain('n4');
    });

    it('should handle replacement at the start of the document', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];
      const original = 'Hello world';
      const edited = 'Goodbye world';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toContain('n1');
      expect(changes[0].afterId).toBeNull();
    });

    it('should handle replacement at the end of the document', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];
      const original = 'Hello world';
      const edited = 'Hello there';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toContain('n2');
    });

    it('should handle complete document replacement', () => {
      const nodeIds = ['n1'];
      const nodeContents = ['Hello'];
      const original = 'Hello';
      const edited = 'Goodbye';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toContain('n1');
      expect(changes[0].newText).toBe('Goodbye');
    });

    it('should return empty array when no nodes exist', () => {
      const changes = computeChanges('', '', [], []);

      expect(changes).toEqual([]);
    });
  });

  describe('word boundary snapping', () => {
    it('should snap single character addition to whole word replacement', () => {
      // Adding "s" to "contractor" should replace the whole word node
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['The ', 'contractor ', 'shall'];
      const original = 'The contractor shall';
      const edited = 'The contractors shall';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('contractors ');
    });

    it('should snap single character deletion to whole word replacement', () => {
      // Removing trailing "s" from "contractors"
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['The ', 'contractors ', 'shall'];
      const original = 'The contractors shall';
      const edited = 'The contractor shall';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('contractor ');
    });

    it('should snap mid-word edit to whole word replacement', () => {
      // Changing "provide" to "provided"
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['shall ', 'provide ', 'all'];
      const original = 'shall provide all';
      const edited = 'shall provided all';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('provided ');
    });

    it('should snap typo fix to whole word replacement', () => {
      // Fixing "teh" -> "the"
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['teh ', 'fox'];
      const original = 'teh fox';
      const edited = 'the fox';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n1']);
      expect(changes[0].newText).toBe('the ');
    });

    it('should snap prefix addition to whole word replacement', () => {
      // "complete" -> "incomplete"
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['the ', 'complete ', 'work'];
      const original = 'the complete work';
      const edited = 'the incomplete work';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('incomplete ');
    });

    it("should handle character insertion that doesn't change words at boundary", () => {
      // Adding a word between two nodes
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['The ', 'fox'];
      const original = 'The fox';
      const edited = 'The quick fox';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      // The insert lands at/near node n1, so n1 should be dirty
      expect(changes[0].deleteIds.length).toBeGreaterThanOrEqual(1);
      expect(changes[0].newText).toContain('quick');
    });

    it('should handle multiple character-level edits in different words', () => {
      // "contractor" -> "contractors" AND "provide" -> "provided"
      const nodeIds = ['n1', 'n2', 'n3', 'n4'];
      const nodeContents = ['The ', 'contractor ', 'shall ', 'provide'];
      const original = 'The contractor shall provide';
      const edited = 'The contractors shall provided';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      // diff-match-patch may merge nearby edits into one group
      // Either way, the new text should contain both modifications
      expect(changes.length).toBeGreaterThanOrEqual(1);

      const allDeletedIds = changes.flatMap((c) => c.deleteIds);
      expect(allDeletedIds).toContain('n2');
      expect(allDeletedIds).toContain('n4');

      const allNewText = changes.map((c) => c.newText).join('');
      expect(allNewText).toContain('contractors');
      expect(allNewText).toContain('provided');
    });

    it('should handle adding punctuation to a word', () => {
      // "world" -> "world."
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];
      const original = 'Hello world';
      const edited = 'Hello world.';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('world.');
    });

    it('should handle capitalizing a word', () => {
      // "the" -> "The"
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['the ', 'quick ', 'fox'];
      const original = 'the quick fox';
      const edited = 'The quick fox';

      const changes = computeChanges(original, edited, nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n1']);
      expect(changes[0].newText).toBe('The ');
    });
  });
});
