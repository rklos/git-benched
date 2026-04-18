import * as vscode from 'vscode';

export interface ObserverEvent {
  type: 'modified-changed' | 'head-changed' | 'repo-opened' | 'repo-closed';
}

interface GitApi {
  readonly repositories: Array<Repository>;
  onDidOpenRepository: vscode.Event<Repository>;
  onDidCloseRepository: vscode.Event<Repository>;
}

interface Repository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly workingTreeChanges: Array<{ uri: vscode.Uri; status: number }>;
    readonly indexChanges: Array<{ uri: vscode.Uri; status: number }>;
    readonly untrackedChanges: Array<{ uri: vscode.Uri; status: number }>;
    readonly HEAD: { readonly commit?: string; readonly name?: string } | undefined;
    onDidChange: vscode.Event<void>;
  };
}

interface GitExtension {
  getAPI(version: 1): GitApi;
}

export class GitObserver {
  private readonly emitter = new vscode.EventEmitter<ObserverEvent>();
  private readonly disposables: vscode.Disposable[] = [];
  private repository: Repository | undefined;
  private lastHeadSha: string | undefined;

  public readonly onDidFire = this.emitter.event;

  public async initialize(): Promise<boolean> {
    const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!ext) { return false; }
    if (!ext.isActive) { await ext.activate(); }
    const api = ext.exports.getAPI(1);

    if (api.repositories.length > 0) {
      this.attachRepository(api.repositories[0]);
    }

    this.disposables.push(api.onDidOpenRepository((repo) => {
      if (!this.repository) { this.attachRepository(repo); }
    }));
    this.disposables.push(api.onDidCloseRepository((repo) => {
      if (this.repository === repo) {
        this.repository = undefined;
        this.emitter.fire({ type: 'repo-closed' });
      }
    }));

    return true;
  }

  public getRepository(): Repository | undefined {
    return this.repository;
  }

  public dispose(): void {
    this.emitter.dispose();
    this.disposables.forEach((d) => {
      d.dispose();
    });
  }

  private attachRepository(repo: Repository): void {
    this.repository = repo;
    const head = repo.state.HEAD;
    if (head && typeof head.commit === 'string') {
      this.lastHeadSha = head.commit;
    }
    this.emitter.fire({ type: 'repo-opened' });
    this.disposables.push(repo.state.onDidChange(() => this.onStateChange()));
  }

  private onStateChange(): void {
    if (!this.repository) { return; }
    const head = this.repository.state.HEAD;
    let headCommit: string | undefined;
    if (head && typeof head.commit === 'string') {
      headCommit = head.commit;
    }
    if (headCommit !== this.lastHeadSha) {
      this.lastHeadSha = headCommit;
      this.emitter.fire({ type: 'head-changed' });
    }
    this.emitter.fire({ type: 'modified-changed' });
  }
}
