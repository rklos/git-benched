import * as vscode from 'vscode';
import type { BenchStore } from './benchStore';
import type { Bench, BenchId, FilePath, HunkRef } from './types';

export type TreeNode =
  | { kind: 'bench'; bench: Bench }
  | { kind: 'file'; benchId: BenchId; filePath: FilePath }
  | { kind: 'hunk'; benchId: BenchId; filePath: FilePath; hunk: HunkRef };

export class BenchTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData = this.emitter.event;

  public constructor(private readonly store: BenchStore) {
    store.onChange(() => this.emitter.fire(undefined));
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === 'bench') {
      const { bench } = element;
      const item = new vscode.TreeItem(
        bench.name,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      const isActive = this.store.getActiveBench().id === bench.id;
      item.description = `${bench.files.size} file(s)${isActive ? ' — active' : ''}`;
      item.iconPath = new vscode.ThemeIcon(isActive ? 'check' : 'folder');
      let kind: string;
      if (bench.isDefault) {
        kind = isActive ? 'bench-default-active' : 'bench-default-inactive';
      } else {
        kind = isActive ? 'bench-regular-active' : 'bench-regular-inactive';
      }
      item.contextValue = kind;
      return item;
    }
    if (element.kind === 'file') {
      const item = new vscode.TreeItem(
        element.filePath.split('/').pop() ?? element.filePath,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = element.filePath;
      item.resourceUri = vscode.Uri.file(element.filePath);
      item.contextValue = 'file';
      return item;
    }
    const hunkItem = new vscode.TreeItem(
      `@${element.hunk.lineRange.startNew}: ${element.hunk.preview.slice(0, 60)}`,
      vscode.TreeItemCollapsibleState.None,
    );
    hunkItem.contextValue = 'hunk';
    return hunkItem;
  }

  public getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.store.getBenches().map((b): TreeNode => ({ kind: 'bench', bench: b }));
    }
    if (element.kind === 'bench') {
      return Array.from(element.bench.files.keys()).map((filePath): TreeNode => ({
        kind: 'file',
        benchId: element.bench.id,
        filePath,
      }));
    }
    if (element.kind === 'file') {
      const bench = this.store.getBench(element.benchId);
      const hunks = bench?.files.get(element.filePath) ?? [];
      return hunks.map((h): TreeNode => ({
        kind: 'hunk',
        benchId: element.benchId,
        filePath: element.filePath,
        hunk: h,
      }));
    }
    return [];
  }
}
