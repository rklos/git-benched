import * as nodeChildProcess from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runFile = promisify(nodeChildProcess.execFile);

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
  public constructor(private readonly cwd: string) {}

  public async diffHead(paths?: string[]): Promise<string> {
    const args = [ 'diff', '--binary', 'HEAD', '--' ];
    if (paths && paths.length > 0) {
      args.push(...paths);
    }
    const { stdout } = await this.run(args);
    return stdout;
  }

  public async diffUntracked(relPath: string): Promise<string> {
    await this.run([ 'add', '--intent-to-add', '--', relPath ]);
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
    await this.runWithFileInput(args, patchContent);
  }

  public async checkoutHead(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.run([ 'checkout', 'HEAD', '--', ...paths ]);
  }

  public async add(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.run([ 'add', '--', ...paths ]);
  }

  public async resetPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.run([ 'reset', 'HEAD', '--', ...paths ]);
  }

  public async commitOnly(options: CommitOptions): Promise<void> {
    await this.run([ 'commit', '--only', '-m', options.message, '--', ...options.paths ]);
  }

  public async statusPorcelain(): Promise<string> {
    const { stdout } = await this.run([ 'status', '--porcelain=v1', '-z' ]);
    return stdout;
  }

  public async headSha(): Promise<string> {
    const { stdout } = await this.run([ 'rev-parse', 'HEAD' ]);
    return stdout.trim();
  }

  public async gitDir(): Promise<string> {
    const { stdout } = await this.run([ 'rev-parse', '--git-dir' ]);
    return join(this.cwd, stdout.trim());
  }

  private async run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return runFile('git', args, { cwd: this.cwd, maxBuffer: 64 * 1024 * 1024 });
  }

  private async runWithFileInput(args: string[], body: string): Promise<void> {
    const tmp = await mkdtemp(join(tmpdir(), 'git-benched-in-'));
    const patchFile = join(tmp, 'in.patch');
    try {
      await writeFile(patchFile, body, 'utf8');
      await runFile('git', [ ...args, patchFile ], { cwd: this.cwd });
    } finally {
      await unlink(patchFile).catch(() => {
        // ignore error
      });
    }
  }
}
