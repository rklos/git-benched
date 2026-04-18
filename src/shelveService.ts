import {
  mkdir, writeFile, readFile, readdir, rm,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchId, FilePath, HunkId, FileStatus } from './types';

export interface ShelfHeader {
  benchId: BenchId;
  filePath: FilePath;
  hunkId: HunkId;
  baseCommit: string;
  shelvedAt: string;
  fileStatus: FileStatus;
  renamedFrom?: FilePath;
}

export interface PatchWriteRequest {
  benchId: BenchId;
  filePath: FilePath;
  hunkId: HunkId;
  patchContent: string;
  header: ShelfHeader;
}

export interface PatchDescriptor {
  benchId: BenchId;
  filePath: FilePath;
  hunkId: HunkId;
  shelfPath: string;
}

export class ShelveService {
  private readonly root: string;

  public constructor(gitDir: string) {
    this.root = join(gitDir, 'git-benched');
  }

  public async writePatch(request: PatchWriteRequest): Promise<PatchDescriptor> {
    const dir = this.dirForFile(request.benchId, request.filePath);
    await mkdir(dir, { recursive: true });
    const shelfPath = join(dir, `${request.hunkId}.patch`);
    const content = this.serialize(request.header, request.patchContent);
    await writeFile(shelfPath, content, 'utf8');
    return {
      benchId: request.benchId,
      filePath: request.filePath,
      hunkId: request.hunkId,
      shelfPath,
    };
  }

  public async readPatch(descriptor: PatchDescriptor): Promise<string> {
    return readFile(descriptor.shelfPath, 'utf8');
  }

  public async readPatchBody(descriptor: PatchDescriptor): Promise<string> {
    const full = await this.readPatch(descriptor);
    const sepIndex = full.indexOf('\n---\n');
    if (sepIndex === -1) {
      return full;
    }
    return full.slice(sepIndex + '\n---\n'.length);
  }

  public async listPatches(benchId: BenchId): Promise<PatchDescriptor[]> {
    const benchDir = join(this.root, 'shelves', benchId);
    if (!existsSync(benchDir)) {
      return [];
    }
    const fileDirs = await readdir(benchDir);
    const results = await Promise.all(
      fileDirs.map(async (fileDir) => {
        const unsanitized = fileDir.replaceAll('__', '/');
        const fullDir = join(benchDir, fileDir);
        const patches = await readdir(fullDir);
        const patchFiles = patches.filter((patch) => patch.endsWith('.patch'));
        return patchFiles.map((patch) => {
          const hunkId = patch.replace(/\.patch$/, '');
          return {
            benchId,
            filePath: unsanitized,
            hunkId,
            shelfPath: join(fullDir, patch),
          };
        });
      }),
    );
    return results.flat();
  }

  public async deletePatch(descriptor: PatchDescriptor): Promise<void> {
    await rm(descriptor.shelfPath, { force: true });
  }

  public async deleteBenchShelves(benchId: BenchId): Promise<void> {
    const benchDir = join(this.root, 'shelves', benchId);
    await rm(benchDir, { recursive: true, force: true });
  }

  public rootPath(): string {
    return this.root;
  }

  private dirForFile(benchId: BenchId, filePath: FilePath): string {
    const sanitized = filePath.replaceAll('/', '__');
    return join(this.root, 'shelves', benchId, sanitized);
  }

  private serialize(header: ShelfHeader, body: string): string {
    const renamedFromPart = header.renamedFrom ? `:${header.renamedFrom}` : '';
    const headerLines = [
      '# git-benched shelf v1',
      `# bench-id: ${header.benchId}`,
      `# file: ${header.filePath}`,
      `# hunk-id: ${header.hunkId}`,
      `# base-commit: ${header.baseCommit}`,
      `# shelved-at: ${header.shelvedAt}`,
      `# file-status: ${header.fileStatus}${renamedFromPart}`,
      '---',
    ];
    return `${headerLines.join('\n')}\n${body}`;
  }
}
