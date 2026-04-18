import * as vscode from 'vscode';
import type { BenchStore } from '../benchStore';
import type { TreeNode } from '../treeDataProvider';
import { activateBench } from '../shelveFlows';
import type { ShelveService } from '../shelveService';
import type { GitOperations } from '../gitOperations';

export function registerBenchCrudCommands(
  context: vscode.ExtensionContext,
  store: BenchStore,
  shelve: ShelveService,
  git: GitOperations,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('git-benched.createBench', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'New bench name',
        placeHolder: 'e.g. Feature A',
      });
      if (name && name.trim().length > 0) {
        store.createBench(name.trim());
      }
    }),

    vscode.commands.registerCommand('git-benched.renameBench', async (node: TreeNode) => {
      if (node.kind !== 'bench') { return; }
      const name = await vscode.window.showInputBox({
        prompt: 'New name',
        value: node.bench.name,
      });
      if (name && name.trim().length > 0) {
        store.renameBench(node.bench.id, name.trim());
      }
    }),

    vscode.commands.registerCommand('git-benched.deleteBench', async (node: TreeNode) => {
      if (node.kind !== 'bench' || node.bench.isDefault) { return; }
      const confirm = vscode.workspace
        .getConfiguration('git-benched')
        .get<boolean>('confirmDeleteNonEmptyBench', true);
      if (confirm && node.bench.files.size > 0) {
        const choice = await vscode.window.showWarningMessage(
          `Delete bench "${node.bench.name}" and move its files to Default Bench?`,
          { modal: true },
          'Delete',
        );
        if (choice !== 'Delete') { return; }
      }
      const defaultBench = store.getDefaultBench();
      Array.from(node.bench.files.entries()).forEach(([ filePath, hunks ]) => {
        hunks.forEach((hunk) => {
          store.moveHunk(node.bench.id, defaultBench.id, filePath, hunk.hunkId);
        });
      });
      store.deleteBench(node.bench.id);
    }),

    vscode.commands.registerCommand('git-benched.activateBench', async (node: TreeNode) => {
      if (node.kind !== 'bench') { return; }
      const deps = { store, shelve, git };
      const result = await activateBench(node.bench.id, deps);
      if (result.conflicts.length > 0) {
        const msg = `Activated "${node.bench.name}" with conflicts in `
          + `${result.conflicts.length} file(s). Resolve conflict markers and save.`;
        vscode.window.showWarningMessage(msg).then(undefined, () => {
          // Ignore promise rejection
        });
      }
    }),
  );
}
