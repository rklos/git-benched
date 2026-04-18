import * as vscode from 'vscode';
import type { BenchStore } from '../benchStore';
import type { ShelveService } from '../shelveService';
import type { GitOperations } from '../gitOperations';
import { activateBench } from '../shelveFlows';
import type { TreeNode } from '../treeDataProvider';

export function registerCommitCommands(
  context: vscode.ExtensionContext,
  store: BenchStore,
  shelve: ShelveService,
  git: GitOperations,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('git-benched.commitBench', async (node: TreeNode) => {
      if (node.kind !== 'bench') { return; }
      if (node.bench.files.size === 0) {
        vscode.window.showInformationMessage(`Bench "${node.bench.name}" is empty.`)
          .then(undefined, () => { /* ignore */ });
        return;
      }
      const draft = node.bench.commitMessageDraft ?? '';
      const message = await vscode.window.showInputBox({
        prompt: `Commit ${node.bench.files.size} file(s) from "${node.bench.name}"`,
        placeHolder: 'Commit message',
        value: draft,
      });
      if (!message || message.trim().length === 0) { return; }
      store.setCommitMessageDraft(node.bench.id, message);

      const deps = { store, shelve, git };
      if (store.getActiveBench().id !== node.bench.id) {
        const result = await activateBench(node.bench.id, deps);
        if (result.conflicts.length > 0) {
          vscode.window.showErrorMessage('Activation produced conflicts; resolve and retry commit.')
            .then(undefined, () => { /* ignore */ });
          return;
        }
      }
      const paths = Array.from(node.bench.files.keys());
      try {
        await git.commitOnly({ paths, message });
        store.setCommitMessageDraft(node.bench.id, '');
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Commit failed: ${detail}`)
          .then(undefined, () => { /* ignore */ });
      }
    }),

    vscode.commands.registerCommand('git-benched.stageBench', async (node: TreeNode) => {
      if (node.kind !== 'bench') { return; }
      if (node.bench.files.size === 0) { return; }
      const deps = { store, shelve, git };
      if (store.getActiveBench().id !== node.bench.id) {
        const result = await activateBench(node.bench.id, deps);
        if (result.conflicts.length > 0) {
          vscode.window.showErrorMessage('Activation produced conflicts; resolve and retry.')
            .then(undefined, () => { /* ignore */ });
          return;
        }
      }
      const paths = Array.from(node.bench.files.keys());
      await git.add(paths);
    }),
  );
}
