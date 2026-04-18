import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShelveService } from './shelveService';

describe('ShelveService', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = mkdtempSync(join(tmpdir(), 'git-benched-shelve-'));
  });

  afterEach(() => {
    rmSync(gitDir, { recursive: true, force: true });
  });

  it('writes and reads a patch', async () => {
    const svc = new ShelveService(gitDir);
    await svc.writePatch({
      benchId: 'bench-1',
      filePath: 'src/foo.ts',
      hunkId: 'h_abc',
      patchContent: 'some patch text',
      header: {
        benchId: 'bench-1',
        filePath: 'src/foo.ts',
        hunkId: 'h_abc',
        baseCommit: 'deadbeef',
        shelvedAt: '2026-04-17T00:00:00Z',
        fileStatus: 'modified',
      },
    });
    const all = await svc.listPatches('bench-1');
    expect(all).toHaveLength(1);
    const content = await svc.readPatch(all[0]);
    expect(content).toContain('some patch text');
    expect(content).toContain('# git-benched shelf v1');
    expect(content).toContain('# bench-id: bench-1');
  });

  it('sanitizes file paths with slashes', async () => {
    const svc = new ShelveService(gitDir);
    await svc.writePatch({
      benchId: 'bench-1',
      filePath: 'deep/nested/path/file.ts',
      hunkId: 'h_xyz',
      patchContent: '',
      header: {
        benchId: 'bench-1',
        filePath: 'deep/nested/path/file.ts',
        hunkId: 'h_xyz',
        baseCommit: 'aaaa',
        shelvedAt: '2026-04-17T00:00:00Z',
        fileStatus: 'modified',
      },
    });
    const all = await svc.listPatches('bench-1');
    expect(all[0].shelfPath).toContain('deep__nested__path__file.ts');
  });

  it('deletes a bench shelf directory', async () => {
    const svc = new ShelveService(gitDir);
    await svc.writePatch({
      benchId: 'bench-1',
      filePath: 'a.ts',
      hunkId: 'h_1',
      patchContent: '',
      header: {
        benchId: 'bench-1',
        filePath: 'a.ts',
        hunkId: 'h_1',
        baseCommit: 'b',
        shelvedAt: 'z',
        fileStatus: 'modified',
      },
    });
    await svc.deleteBenchShelves('bench-1');
    const all = await svc.listPatches('bench-1');
    expect(all).toHaveLength(0);
  });
});
