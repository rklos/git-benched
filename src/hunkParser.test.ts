import { describe, it, expect } from 'vitest';
import { parseHunks, hunkIdFromPatch } from './hunkParser';

const SINGLE_HUNK_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 4d2f1ae..7c9e3b2 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,3 +10,4 @@
 line10
 line11
-line12
+line12-modified
+line13-added
`;

const MULTI_HUNK_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 4d2f1ae..7c9e3b2 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
@@ -10,3 +10,4 @@
 line10
 line11
-line12
+line12-modified
+line13-added
`;

const NEW_FILE_DIFF = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+new line 1
+new line 2
`;

const RENAMED_DIFF = `diff --git a/old.ts b/new.ts
similarity index 90%
rename from old.ts
rename to new.ts
index 4d2f1ae..7c9e3b2 100644
--- a/old.ts
+++ b/new.ts
@@ -1,1 +1,1 @@
-x
+y
`;

describe('parseHunks', () => {
  it('parses a single-hunk diff into one HunkPatch', () => {
    const hunks = parseHunks(SINGLE_HUNK_DIFF);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].filePath).toBe('src/foo.ts');
    expect(hunks[0].oldBlob).toBe('4d2f1ae');
    expect(hunks[0].newBlob).toBe('7c9e3b2');
    expect(hunks[0].fileStatus).toBe('modified');
    expect(hunks[0].lineRange).toEqual({
      startOld: 10, countOld: 3, startNew: 10, countNew: 4,
    });
    expect(hunks[0].patchContent).toContain('@@ -10,3 +10,4 @@');
  });

  it('parses a multi-hunk single-file diff into multiple HunkPatches', () => {
    const hunks = parseHunks(MULTI_HUNK_DIFF);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].lineRange.startOld).toBe(1);
    expect(hunks[1].lineRange.startOld).toBe(10);
  });

  it('parses a new-file diff with fileStatus = untracked', () => {
    const hunks = parseHunks(NEW_FILE_DIFF);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].fileStatus).toBe('untracked');
    expect(hunks[0].filePath).toBe('src/new.ts');
  });

  it('parses a rename diff with renamedFrom set', () => {
    const hunks = parseHunks(RENAMED_DIFF);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].fileStatus).toBe('renamed');
    expect(hunks[0].renamedFrom).toBe('old.ts');
    expect(hunks[0].filePath).toBe('new.ts');
  });

  it('computes a deterministic hunkId from blob hashes + line range', () => {
    const hunks = parseHunks(SINGLE_HUNK_DIFF);
    const id1 = hunkIdFromPatch(hunks[0]);
    const id2 = hunkIdFromPatch(hunks[0]);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^h_[0-9a-f]{12}$/);
  });
});
