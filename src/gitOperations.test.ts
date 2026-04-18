import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import { simpleGit } from 'simple-git';
import { GitOperations } from './gitOperations';

vi.mock('simple-git');

describe('GitOperations', () => {
  const diff = vi.fn();
  const raw = vi.fn();
  const add = vi.fn();
  const revparse = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(simpleGit).mockReturnValue({
      diff,
      raw,
      add,
      revparse,
    } as unknown as ReturnType<typeof simpleGit>);
    diff.mockResolvedValue('');
    raw.mockResolvedValue('');
    add.mockResolvedValue(undefined);
    revparse.mockResolvedValue('');
  });

  it('diffHead passes the right args to simple-git', async () => {
    diff.mockResolvedValueOnce('<<diff output>>');
    const git = new GitOperations('/some/path');
    const result = await git.diffHead();
    expect(diff).toHaveBeenCalledWith([ '--binary', 'HEAD' ]);
    expect(result).toBe('<<diff output>>');
  });

  it('diffHead with paths appends -- <paths>', async () => {
    const git = new GitOperations('/some/path');
    await git.diffHead([ 'src/a.ts', 'src/b.ts' ]);
    expect(diff).toHaveBeenCalledWith([ '--binary', 'HEAD', '--', 'src/a.ts', 'src/b.ts' ]);
  });

  it('diffUntracked calls intent-to-add then diffHead', async () => {
    diff.mockResolvedValueOnce('<<untracked diff>>');
    const git = new GitOperations('/some/path');
    const result = await git.diffUntracked('new.ts');
    expect(raw).toHaveBeenCalledWith([ 'add', '--intent-to-add', '--', 'new.ts' ]);
    expect(diff).toHaveBeenCalledWith([ '--binary', 'HEAD', '--', 'new.ts' ]);
    expect(result).toBe('<<untracked diff>>');
  });

  it('add is a no-op when paths is empty', async () => {
    const git = new GitOperations('/some/path');
    await git.add([]);
    expect(add).not.toHaveBeenCalled();
  });

  it('add calls git.add with the given paths', async () => {
    const git = new GitOperations('/some/path');
    await git.add([ 'foo', 'bar' ]);
    expect(add).toHaveBeenCalledWith([ 'foo', 'bar' ]);
  });

  it('checkoutHead is a no-op when paths is empty', async () => {
    const git = new GitOperations('/some/path');
    await git.checkoutHead([]);
    expect(raw).not.toHaveBeenCalled();
  });

  it('checkoutHead calls git checkout HEAD -- <paths>', async () => {
    const git = new GitOperations('/some/path');
    await git.checkoutHead([ 'x.ts' ]);
    expect(raw).toHaveBeenCalledWith([ 'checkout', 'HEAD', '--', 'x.ts' ]);
  });

  it('commitOnly shells git commit --only -m <msg> -- <paths>', async () => {
    const git = new GitOperations('/some/path');
    await git.commitOnly({ paths: [ 'a.ts' ], message: 'msg' });
    expect(raw).toHaveBeenCalledWith([ 'commit', '--only', '-m', 'msg', '--', 'a.ts' ]);
  });

  it('headSha returns trimmed result', async () => {
    revparse.mockResolvedValueOnce('abc123\n');
    const git = new GitOperations('/some/path');
    const sha = await git.headSha();
    expect(sha).toBe('abc123');
    expect(revparse).toHaveBeenCalledWith([ 'HEAD' ]);
  });

  it('gitDir joins cwd with revparse --git-dir output', async () => {
    revparse.mockResolvedValueOnce('.git\n');
    const git = new GitOperations('/repo');
    const dir = await git.gitDir();
    expect(dir).toBe('/repo/.git');
  });

  it('apply with threeWay=true includes --3way in args', async () => {
    const git = new GitOperations('/some/path');
    await git.apply('patch content', { threeWay: true });
    const applyArgs = vi.mocked(raw).mock.calls.find((c) => c[0] === 'apply' || (Array.isArray(c[0]) && (c[0] as string[])[0] === 'apply'));
    expect(applyArgs).toBeDefined();
    expect(raw).toHaveBeenCalledWith(expect.arrayContaining([ 'apply', '--3way' ]));
  });

  it('apply with reverse=true includes --reverse in args', async () => {
    const git = new GitOperations('/some/path');
    await git.apply('patch content', { threeWay: false, reverse: true });
    expect(raw).toHaveBeenCalledWith(expect.arrayContaining([ 'apply', '--reverse' ]));
  });

  it('apply with cached=true includes --cached in args', async () => {
    const git = new GitOperations('/some/path');
    await git.apply('patch content', { threeWay: false, cached: true });
    expect(raw).toHaveBeenCalledWith(expect.arrayContaining([ 'apply', '--cached' ]));
  });

  it('resetPaths is no-op when empty', async () => {
    const git = new GitOperations('/some/path');
    await git.resetPaths([]);
    expect(raw).not.toHaveBeenCalled();
  });

  it('resetPaths invokes git reset HEAD -- <paths>', async () => {
    const git = new GitOperations('/some/path');
    await git.resetPaths([ 'x.ts' ]);
    expect(raw).toHaveBeenCalledWith([ 'reset', 'HEAD', '--', 'x.ts' ]);
  });

  it('statusPorcelain returns git raw result', async () => {
    raw.mockResolvedValueOnce('some status');
    const git = new GitOperations('/some/path');
    const status = await git.statusPorcelain();
    expect(status).toBe('some status');
    expect(raw).toHaveBeenCalledWith([ 'status', '--porcelain=v1', '-z' ]);
  });
});
