import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

export interface CommitOptions {
  paths: string[];
  message: string;
}

export interface ApplyOptions {
  threeWay: boolean;
  reverse?: boolean;
  cached?: boolean;
}

export class GitOperations {
  private readonly git: SimpleGit;

  public constructor(private readonly cwd: string) {
    this.git = simpleGit(cwd);
  }

  public async diffHead(paths?: string[]): Promise<string> {
    if (paths && paths.length > 0) {
      return this.git.diff([ '--binary', 'HEAD', '--', ...paths ]);
    }
    return this.git.diff([ '--binary', 'HEAD' ]);
  }

  public async diffUntracked(relPath: string): Promise<string> {
    await this.git.raw([ 'add', '--intent-to-add', '--', relPath ]);
    return this.diffHead([ relPath ]);
  }

  public async apply(patchContent: string, options: ApplyOptions): Promise<void> {
    const args = [ 'apply' ];
    if (options.threeWay) {
      args.push('--3way');
    }
    if (options.reverse) {
      args.push('--reverse');
    }
    if (options.cached) {
      args.push('--cached');
    }
    const tmp = await mkdtemp(join(tmpdir(), 'git-benched-in-'));
    const patchFile = join(tmp, 'in.patch');
    try {
      await writeFile(patchFile, patchContent, 'utf8');
      await this.git.raw([ ...args, patchFile ]);
    } finally {
      await unlink(patchFile).catch(() => {
        // ignore error
      });
    }
  }

  public async checkoutHead(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.git.raw([ 'checkout', 'HEAD', '--', ...paths ]);
  }

  public async add(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.git.add(paths);
  }

  public async resetPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.git.raw([ 'reset', 'HEAD', '--', ...paths ]);
  }

  public async commitOnly(options: CommitOptions): Promise<void> {
    await this.git.raw([ 'commit', '--only', '-m', options.message, '--', ...options.paths ]);
  }

  public async statusPorcelain(): Promise<string> {
    return this.git.raw([ 'status', '--porcelain=v1', '-z' ]);
  }

  public async headSha(): Promise<string> {
    const result = await this.git.revparse([ 'HEAD' ]);
    return result.trim();
  }

  public async gitDir(): Promise<string> {
    const result = await this.git.revparse([ '--git-dir' ]);
    return join(this.cwd, result.trim());
  }
}
