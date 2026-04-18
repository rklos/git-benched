import * as vscode from 'vscode';
import { BenchStore } from './benchStore';
import { BenchSynchronizer } from './benchSynchronizer';
import { BenchTreeDataProvider } from './treeDataProvider';
import { BenchDnDController } from './dndController';
import { GitObserver } from './gitObserver';
import { GitOperations } from './gitOperations';
import { ShelveService } from './shelveService';
import { Logger } from './logger';
import { ensureReadme } from './readme';
import { registerAllCommands } from './commands';
import { parseHunks } from './hunkParser';
import type { SerializedState } from './types';

const STATE_KEY_PREFIX = 'git-benched.state.v1';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new Logger();
  context.subscriptions.push({ dispose: () => logger.dispose() });

  const debug = vscode.workspace.getConfiguration('git-benched').get<boolean>('debug.enableLogging', false);
  logger.setDebugEnabled(debug);
  logger.info('Git Benched activating');

  const observer = new GitObserver();
  context.subscriptions.push({ dispose: () => observer.dispose() });

  const ready = await observer.initialize();
  if (!ready) {
    logger.warn('Git extension not available');
    return;
  }
  const repo = observer.getRepository();
  if (!repo) {
    logger.info('No git repository open');
    return;
  }

  const repoPath = repo.rootUri.fsPath;
  const git = new GitOperations(repoPath);
  const gitDir = await git.gitDir();
  await ensureReadme(gitDir);

  const shelve = new ShelveService(gitDir);
  const stateKey = `${STATE_KEY_PREFIX}.${repoPath}`;
  const savedState = context.workspaceState.get<SerializedState>(stateKey);
  const store = savedState
    ? BenchStore.fromSerialized(savedState, repoPath)
    : new BenchStore(undefined, repoPath);

  store.onChange(() => {
    context.workspaceState.update(stateKey, store.serialize())
      .then(undefined, (err: unknown) => { logger.error('workspaceState.update failed', err); });
  });

  const synchronizer = new BenchSynchronizer(store, {
    diffHead: (paths) => git.diffHead(paths),
    headSha: () => git.headSha(),
    parseDiff: parseHunks,
  });

  observer.onDidFire((event) => {
    if (event.type === 'modified-changed' || event.type === 'head-changed') {
      synchronizer.reconcile().then(undefined, (err: unknown) => {
        logger.error('reconcile failed', err);
      });
    }
  });

  const treeProvider = new BenchTreeDataProvider(store);
  const dnd = new BenchDnDController(store, shelve, git);

  const treeView = vscode.window.createTreeView('git-benched.benchesView', {
    treeDataProvider: treeProvider,
    dragAndDropController: dnd,
    canSelectMany: true,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  registerAllCommands(context, { store, shelve, git });

  vscode.commands.executeCommand('setContext', 'git-benched.hasRepository', true)
    .then(undefined, (err: unknown) => { logger.error('setContext failed', err); });

  await synchronizer.reconcile();

  logger.info('Git Benched activated');
}

export function deactivate(): void {
  // context.subscriptions handles cleanup
}
