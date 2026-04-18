import { createHash } from 'node:crypto';
import type { LineRange, FileStatus } from './types';

export interface HunkPatch {
  filePath: string;
  oldBlob: string;
  newBlob: string;
  fileStatus: FileStatus;
  lineRange: LineRange;
  patchContent: string;
  renamedFrom?: string;
}

const DIFF_HEADER_RE = /^diff --git a\/(.+?) b\/(.+)$/;
const INDEX_RE = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: (\d+))?$/;
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseHunks(diffOutput: string): HunkPatch[] {
  const results: HunkPatch[] = [];
  const lines = diffOutput.split('\n');

  let currentFile: string | null = null;
  let oldBlob = '';
  let newBlob = '';
  let fileStatus: FileStatus = 'modified';
  let renamedFrom: string | undefined;
  let fileHeader: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const diffHeaderMatch = DIFF_HEADER_RE.exec(line);
    if (diffHeaderMatch) {
      const [ , , filePath ] = diffHeaderMatch;
      currentFile = filePath;
      oldBlob = '';
      newBlob = '';
      fileStatus = 'modified';
      renamedFrom = undefined;
      fileHeader = [ line ];
    } else if (currentFile === null) {
      // Skip lines before we have a current file
    } else {
      const indexMatch = INDEX_RE.exec(line);
      if (indexMatch) {
        const [ , blob1, blob2 ] = indexMatch;
        oldBlob = blob1;
        newBlob = blob2;
        fileHeader.push(line);
      } else if (line.startsWith('new file mode')) {
        fileStatus = 'untracked';
        fileHeader.push(line);
      } else if (line.startsWith('deleted file mode')) {
        fileStatus = 'deleted';
        fileHeader.push(line);
      } else if (line.startsWith('rename from ')) {
        fileStatus = 'renamed';
        renamedFrom = line.slice('rename from '.length);
        fileHeader.push(line);
      } else if (line.startsWith('rename to ') || line.startsWith('similarity index ')) {
        fileHeader.push(line);
      } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
        fileHeader.push(line);
      } else {
        const hunkMatch = HUNK_RE.exec(line);
        if (hunkMatch) {
          const lineRange: LineRange = {
            startOld: parseInt(hunkMatch[1], 10),
            countOld: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
            startNew: parseInt(hunkMatch[3], 10),
            countNew: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
          };

          const bodyLines: string[] = [ line ];
          let j = i + 1;
          while (j < lines.length) {
            const next = lines[j];
            if (DIFF_HEADER_RE.test(next) || HUNK_RE.test(next)) {
              break;
            }
            bodyLines.push(next);
            j++;
          }

          const patchContent = [ ...fileHeader, ...bodyLines ].join('\n');

          results.push({
            filePath: currentFile,
            oldBlob,
            newBlob,
            fileStatus,
            lineRange,
            patchContent,
            renamedFrom,
          });

          i = j - 1;
        }
      }
    }
  }

  return results;
}

export function hunkIdFromPatch(hunk: HunkPatch): string {
  const material = [
    hunk.filePath,
    hunk.oldBlob,
    hunk.newBlob,
    `${hunk.lineRange.startOld},${hunk.lineRange.countOld}`,
    `${hunk.lineRange.startNew},${hunk.lineRange.countNew}`,
  ].join('|');
  const hash = createHash('sha256').update(material).digest('hex').slice(0, 12);
  return `h_${hash}`;
}
