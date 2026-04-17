# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile        # one-shot TypeScript build → out/
npm run watch          # incremental watch build (used during F5 debug)
npm run lint           # ESLint across src/
npm run test           # run Vitest tests once
npm run test:watch     # Vitest in watch mode
npm run test:coverage  # Vitest with V8 coverage
```

Press **F5** in VS Code to launch the Extension Development Host (uses `.vscode/launch.json` + the watch build task).

## Architecture

The extension follows a three-layer pattern:

| Layer | File | Responsibility |
|---|---|---|
| Entry point | `src/extension.ts` | Registers all commands and the tree view; wires `ChangelistManager` ↔ `ChangelistTreeProvider` |
| Domain model | `src/changelistManager.ts` | Owns `Changelist[]` state, all mutations, and persistence via `vscode.Memento` (workspace storage) |
| View | `src/changelistTreeProvider.ts` | `TreeDataProvider` that renders changelists and their files in the SCM sidebar |

**State persistence**: `ChangelistManager` serialises the full changelist array to `workspaceState` under the key `git-benched.changelists`. A "Default" changelist is always created on first activation and cannot be deleted — files from a deleted list are migrated to Default.

**Context values** drive the context menu visibility in `package.json#contributes.menus`: tree items expose `contextValue = "changelist"` or `"changedFile"`.

## ESLint

Uses `@rklos/eslint-config/typescript` and `@rklos/eslint-config/vitest` via `eslint.config.mjs`. When adding new project types, extend from the appropriate `@rklos/eslint-config/<preset>`.

## Dependencies

All npm dependency versions are pinned exactly (no `^` or `~`). Always fetch the current latest version from npm before adding or updating a dependency.
