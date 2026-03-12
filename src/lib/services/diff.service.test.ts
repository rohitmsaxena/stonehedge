jest.mock('../prisma', () => ({ prisma: {} }));

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

      const changes = computeChanges('The slow fox', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('slow ');
    });

    it('should detect a pure deletion', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['The ', 'quick ', 'fox'];

      const changes = computeChanges('The fox', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('delete');
      expect(changes[0].deleteIds).toEqual(['n2']);
    });

    it('should return no changes when text is identical', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];

      const changes = computeChanges('Hello world', nodeIds, nodeContents);

      expect(changes).toHaveLength(0);
    });

    it('should detect multiple changes in different sections', () => {
      const nodeIds = ['n1', 'n2', 'n3', 'n4', 'n5'];
      const nodeContents = ['The ', 'quick ', 'brown ', 'fox ', 'jumped'];

      const changes = computeChanges('The slow brown cat jumped', nodeIds, nodeContents);

      expect(changes.length).toBeGreaterThanOrEqual(2);

      const allDeletedIds = changes.flatMap((c) => c.deleteIds);
      expect(allDeletedIds).toContain('n2');
      expect(allDeletedIds).toContain('n4');
    });

    it('should handle replacement at the start of the document', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];

      const changes = computeChanges('Goodbye world', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toContain('n1');
      expect(changes[0].afterId).toBeNull();
    });

    it('should handle replacement at the end of the document', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];

      const changes = computeChanges('Hello there', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toContain('n2');
    });

    it('should handle complete document replacement', () => {
      const nodeIds = ['n1'];
      const nodeContents = ['Hello'];

      const changes = computeChanges('Goodbye', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toContain('n1');
      expect(changes[0].newText).toBe('Goodbye');
    });

    it('should return empty array when no nodes exist', () => {
      const changes = computeChanges('', [], []);

      expect(changes).toEqual([]);
    });
  });

  describe('word boundary snapping', () => {
    it('should snap single character addition to whole word replacement', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['The ', 'contractor ', 'shall'];

      const changes = computeChanges('The contractors shall', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('contractors ');
    });

    it('should snap single character deletion to whole word replacement', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['The ', 'contractors ', 'shall'];

      const changes = computeChanges('The contractor shall', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('contractor ');
    });

    it('should snap mid-word edit to whole word replacement', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['shall ', 'provide ', 'all'];

      const changes = computeChanges('shall provided all', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('provided ');
    });

    it('should snap typo fix to whole word replacement', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['teh ', 'fox'];

      const changes = computeChanges('the fox', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n1']);
      expect(changes[0].newText).toBe('the ');
    });

    it('should snap prefix addition to whole word replacement', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['the ', 'complete ', 'work'];

      const changes = computeChanges('the incomplete work', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('incomplete ');
    });

    it('should handle inserting a new word between existing nodes', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['The ', 'fox'];

      const changes = computeChanges('The quick fox', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('insert');
      expect(changes[0].deleteIds).toEqual([]);
      expect(changes[0].afterId).toBe('n1');
      expect(changes[0].newText).toContain('quick');
    });

    it('should handle multiple character-level edits in different words', () => {
      const nodeIds = ['n1', 'n2', 'n3', 'n4'];
      const nodeContents = ['The ', 'contractor ', 'shall ', 'provide'];

      const changes = computeChanges('The contractors shall provided', nodeIds, nodeContents);

      expect(changes.length).toBeGreaterThanOrEqual(1);

      const allDeletedIds = changes.flatMap((c) => c.deleteIds);
      expect(allDeletedIds).toContain('n2');
      expect(allDeletedIds).toContain('n4');

      const allNewText = changes.map((c) => c.newText).join('');
      expect(allNewText).toContain('contractors');
      expect(allNewText).toContain('provided');
    });

    it('should handle adding punctuation to a word', () => {
      const nodeIds = ['n1', 'n2'];
      const nodeContents = ['Hello ', 'world'];

      const changes = computeChanges('Hello world.', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n2']);
      expect(changes[0].newText).toBe('world.');
    });

    it('should handle capitalizing a word', () => {
      const nodeIds = ['n1', 'n2', 'n3'];
      const nodeContents = ['the ', 'quick ', 'fox'];

      const changes = computeChanges('The quick fox', nodeIds, nodeContents);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('replace');
      expect(changes[0].deleteIds).toEqual(['n1']);
      expect(changes[0].newText).toBe('The ');
    });
  });
});
