import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MathSymbolStore } from './mathPalette';

describe('MathSymbolStore', () => {
  let tmpDir: string;
  let store: MathSymbolStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myst-test-'));
    // Create .vscode dir if store expects it — store handles auto-create on save
    store = new MathSymbolStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('_toJSON and _fromJSON', () => {
    it('round-trips symbol stats', () => {
      store.add('\\alpha');
      store.add('\\alpha');
      store.add('\\beta');
      const json = store._toJSON();
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.symbols['\\alpha'].count).toBe(2);
      expect(parsed.symbols['\\beta'].count).toBe(1);
      expect(parsed.symbols['\\alpha'].lastUsed).toBeTruthy();

      // Fresh store loads the same data
      const store2 = new MathSymbolStore(tmpDir);
      store2._fromJSON(json);
      expect(store2.getRecent(10)[0]).toBe('\\alpha'); // higher count = first
    });

    it('_fromJSON handles empty object gracefully', () => {
      store._fromJSON('{}');
      expect(store.getRecent(10)).toEqual([]);
    });

    it('_fromJSON handles malformed JSON gracefully', () => {
      store._fromJSON('not json at all {{{');
      expect(store.getRecent(10)).toEqual([]);
    });
  });

  describe('add and getRecent', () => {
    it('increments count on repeated adds', () => {
      store.add('\\alpha');
      store.add('\\alpha');
      store.add('\\beta');
      expect(store.getStats('\\alpha')?.count).toBe(2);
      expect(store.getStats('\\beta')?.count).toBe(1);
      expect(store.getStats('\\gamma')).toBeUndefined();
    });

    it('sorts by count descending, then lastUsed descending', async () => {
      // Add alpha 3 times, beta 5 times, gamma 3 times
      for (let i = 0; i < 3; i++) store.add('\\alpha');
      await new Promise(r => setTimeout(r, 5)); // ensure distinct lastUsed timestamps
      for (let i = 0; i < 5; i++) store.add('\\beta');
      await new Promise(r => setTimeout(r, 5));
      for (let i = 0; i < 3; i++) store.add('\\gamma');
      // Last-used order: gamma > beta > alpha (gamma added most recently)
      const recent = store.getRecent(10);
      expect(recent[0]).toBe('\\beta');  // highest count
      // alpha and gamma both have count 3, gamma was used more recently
      const alphaIdx = recent.indexOf('\\alpha');
      const gammaIdx = recent.indexOf('\\gamma');
      expect(gammaIdx).toBeLessThan(alphaIdx);
    });

    it('returns empty array when no symbols added', () => {
      expect(store.getRecent(10)).toEqual([]);
    });

    it('markSeen does not increment count for existing symbols', () => {
      store.add('\\alpha');
      expect(store.getStats('\\alpha')?.count).toBe(1);
      store.markSeen('\\alpha');
      expect(store.getStats('\\alpha')?.count).toBe(1); // unchanged
    });

    it('markSeen adds unseen symbols with count 0', () => {
      store.markSeen('\\alpha');
      expect(store.getStats('\\alpha')?.count).toBe(0);
      // Subsequent markSeen keeps count at 0
      store.markSeen('\\alpha');
      expect(store.getStats('\\alpha')?.count).toBe(0);
    });
  });

  describe('load', () => {
    it('loads from config file', async () => {
      // Write a config file manually
      const vscodeDir = path.join(tmpDir, '.vscode');
      fs.mkdirSync(vscodeDir, { recursive: true });
      const config = {
        version: 1,
        symbols: {
          '\\mathbb{R}': { count: 5, lastUsed: '2026-07-30T10:00:00Z' },
        },
      };
      fs.writeFileSync(path.join(vscodeDir, 'myst-symbols.json'), JSON.stringify(config));

      await store.load();
      expect(store.getStats('\\mathbb{R}')?.count).toBe(5);
    });

    it('handles missing config file gracefully', async () => {
      await store.load(); // no file exists
      expect(store.getRecent(10)).toEqual([]); // empty but no error
    });

    it('migrates from legacy workspaceState format', async () => {
      const legacyState = {
        get: (key: string, _default: any) => {
          if (key === 'myst-notebook.mathSymbols') return ['\\alpha', '\\beta', '\\alpha'];
          return undefined;
        },
        update: () => Promise.resolve(),
      };

      await store.load(legacyState as any);
      // '\\alpha' appears twice in the legacy array, '\\beta' once
      expect(store.getStats('\\alpha')?.count).toBe(2);
      expect(store.getStats('\\beta')?.count).toBe(1);
    });
  });

  describe('save', () => {
    it('saves to config file, creating .vscode directory if needed', async () => {
      store.add('\\alpha');
      await (store as any).save(); // call private save for testing
      const configPath = path.join(tmpDir, '.vscode', 'myst-symbols.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(content.version).toBe(1);
      expect(content.symbols['\\alpha'].count).toBe(1);
    });
  });
});
