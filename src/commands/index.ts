import type * as vscode from 'vscode';
import type { BenchStore } from '../benchStore';
import type { ShelveService } from '../shelveService';
import type { GitOperations } from '../gitOperations';
import { registerBenchCrudCommands } from './benchCrud';

export interface CommandDeps {
  store: BenchStore;
  shelve: ShelveService;
  git: GitOperations;
}

export function registerAllCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  registerBenchCrudCommands(context, deps.store, deps.shelve, deps.git);
}
