import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const README_CONTENT = `Git Benched — shelved changelists

This folder is managed by the "Git Benched" VS Code extension.
It stores uncommitted changes that belong to inactive benches
(changelists), kept as standard unified-diff patch files.

Files here are local to this clone. They are not tracked or pushed
by Git. Deleting any of this folder's contents will permanently lose
the shelved changes it contained — there is no server-side backup.

If you uninstall the extension, these patches remain on disk and
can be applied manually with:

    git apply --3way <path/to/file.patch>

Do not edit the .patch files by hand. Each file's header is used to
reconstruct the extension's internal state; manual changes may desync
the extension from the on-disk state.
`;

export async function ensureReadme(gitDir: string): Promise<void> {
  const dir = join(gitDir, 'git-benched');
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'README.txt');
  if (existsSync(path)) { return; }
  await writeFile(path, README_CONTENT, 'utf8');
}
