import * as vscode from 'vscode';
import type { BenchStore } from './benchStore';
import type { ShelveService } from './shelveService';
import type { GitOperations } from './gitOperations';
import type { TreeNode } from './treeDataProvider';
import { shelveHunks, activateBench } from './shelveFlows';

const MIME = 'application/vnd.code.tree.git-benched';

type DragPayload =
  | { kind: 'file'; benchId: string; filePath: string }
  | { kind: 'hunk'; benchId: string; filePath: string; hunkId: string };

export class BenchDnDController implements vscode.TreeDragAndDropController<TreeNode> {
  public readonly dragMimeTypes = [ MIME ];
  public readonly dropMimeTypes = [ MIME ];

  public constructor(
    private readonly store: BenchStore,
    private readonly shelve: ShelveService,
    private readonly git: GitOperations,
  ) {}

  public handleDrag(
    source: readonly TreeNode[],
    dataTransfer: vscode.DataTransfer,
  ): void {
    const payload: DragPayload[] = source
      .filter((n) => n.kind === 'file' || n.kind === 'hunk')
      .map((n): DragPayload => {
        if (n.kind === 'file') {
          return { kind: 'file', benchId: n.benchId, filePath: n.filePath };
        }
        if (n.kind === 'hunk') {
          return { kind: 'hunk', benchId: n.benchId, filePath: n.filePath, hunkId: n.hunk.hunkId };
        }
        throw new Error('unreachable');
      });
    dataTransfer.set(MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  public async handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
  ): Promise<void> {
    if (!target || target.kind !== 'bench') { return; }
    const item = dataTransfer.get(MIME);
    if (!item) { return; }

    const payload = JSON.parse(item.value as string) as DragPayload[];

    const targetBenchId = target.bench.id;
    const activeId = this.store.getActiveBench().id;
    const deps = { store: this.store, shelve: this.shelve, git: this.git };

    // Sequential: each shelve/activate mutates the working tree
    await payload.reduce<Promise<void>>(async (accPromise, entry) => {
      await accPromise;
      if (entry.benchId === targetBenchId) { return; }

      if (targetBenchId === activeId) {
        // Dragging FROM an inactive bench INTO the active bench =
        // activate the source bench (restores its content to the working tree).
        await activateBench(entry.benchId, deps);
        return;
      }

      if (entry.kind === 'file') {
        await shelveHunks({ benchId: targetBenchId, filePath: entry.filePath }, deps);
      } else {
        await shelveHunks(
          { benchId: targetBenchId, filePath: entry.filePath, hunkIds: [ entry.hunkId ] },
          deps,
        );
      }
    }, Promise.resolve());
  }
}
