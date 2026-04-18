import * as vscode from 'vscode';
import type { BenchStore } from '../benchStore';
import type { ShelveService } from '../shelveService';
import type { GitOperations } from '../gitOperations';
import { shelveHunks, shelveSelection } from '../shelveFlows';
import type { TreeNode } from '../treeDataProvider';

async function pickTargetBench(store: BenchStore, excludeId?: string): Promise<string | undefined> {
  const benches = store.getBenches().filter((b) => b.id !== excludeId);
  const choice = await vscode.window.showQuickPick(
    benches.map((b) => ({ label: b.name, id: b.id })),
    { placeHolder: 'Assign to bench' },
  );
  return choice?.id;
}

export function registerAssignmentCommands(
  context: vscode.ExtensionContext,
  store: BenchStore,
  shelve: ShelveService,
  git: GitOperations,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('git-benched.moveFileToBench', async (node: TreeNode) => {
      if (node.kind !== 'file') { return; }
      const targetId = await pickTargetBench(store, node.benchId);
      if (!targetId) { return; }
      await shelveHunks({ benchId: targetId, filePath: node.filePath }, { store, shelve, git });
    }),

    vscode.commands.registerCommand('git-benched.assignSelectionToBench', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('Select some lines first.').then(undefined, () => { /* ignore */ });
        return;
      }
      const targetId = await pickTargetBench(store);
      if (!targetId) { return; }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
      await shelveSelection(
        {
          benchId: targetId,
          filePath,
          startLine: editor.selection.start.line + 1,
          endLine: editor.selection.end.line + 1,
        },
        { store, shelve, git },
      );
    }),
  );
}
