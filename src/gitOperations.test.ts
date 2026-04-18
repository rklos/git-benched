import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitOperations } from './gitOperations';

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'git-benched-test-'));
  const env = { ...process.env, GIT_CREDENTIAL_HELPER: '' };
  execFileSync('git', [ 'init', '-q', '-b', 'main' ], { cwd: dir, env });
  execFileSync('git', [ 'config', 'user.email', 't@example.com' ], { cwd: dir, env });
  execFileSync('git', [ 'config', 'user.name', 'Test' ], { cwd: dir, env });
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nthree\n');
  execFileSync('git', [ 'add', '-A' ], { cwd: dir, env });
  execFileSync('git', [ 'commit', '-q', '-m', 'initial' ], { cwd: dir, env });
  return dir;
}

describe('GitOperations', () => {
  let repoDir: string;
  let git: GitOperations;

  beforeEach(() => {
    repoDir = initRepo();
    git = new GitOperations(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('diffHead returns empty string for a clean tree', async () => {
    const diff = await git.diffHead();
    expect(diff).toBe('');
  });

  it('diffHead returns a unified diff after editing a file', async () => {
    writeFileSync(join(repoDir, 'a.txt'), 'one\nTWO\nthree\n');
    const diff = await git.diffHead();
    expect(diff).toContain('diff --git a/a.txt b/a.txt');
    expect(diff).toContain('-two');
    expect(diff).toContain('+TWO');
  });
});
