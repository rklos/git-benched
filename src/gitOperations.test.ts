import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitOperations } from './gitOperations';

const ISOLATED_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GPG_TTY: '',
  HOME: '/tmp/git-benched-nohome',
};

// Ensure the isolated HOME directory exists
try {
  mkdirSync('/tmp/git-benched-nohome', { recursive: true });
} catch {
  // directory may already exist
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'git-benched-test-'));
  execFileSync('git', [ 'init', '-q', '-b', 'main' ], { cwd: dir, env: ISOLATED_ENV });
  execFileSync('git', [ 'config', 'user.email', 't@example.com' ], { cwd: dir, env: ISOLATED_ENV });
  execFileSync('git', [ 'config', 'user.name', 'Test' ], { cwd: dir, env: ISOLATED_ENV });
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nthree\n');
  execFileSync('git', [ 'add', '-A' ], { cwd: dir, env: ISOLATED_ENV });
  execFileSync('git', [ 'commit', '-q', '-m', 'initial' ], { cwd: dir, env: ISOLATED_ENV });
  return dir;
}

describe('GitOperations', () => {
  let repoDir: string;
  let git: GitOperations;

  beforeEach(() => {
    repoDir = initRepo();
    git = new GitOperations(repoDir, ISOLATED_ENV);
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
