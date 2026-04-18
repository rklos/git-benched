export type BenchId = string;

export type FilePath = string;

export type HunkId = string;

export type FileStatus = 'modified' | 'untracked' | 'deleted' | 'renamed';

export interface LineRange {
  startOld: number;
  countOld: number;
  startNew: number;
  countNew: number;
}

export interface HunkRef {
  hunkId: HunkId;
  filePath: FilePath;
  shelfPath: string;
  preview: string;
  lineRange: LineRange;
  fileStatus: FileStatus;
  renamedFrom?: FilePath;
}

export interface Bench {
  id: BenchId;
  name: string;
  isDefault: boolean;
  files: Map<FilePath, HunkRef[]>;
  commitMessageDraft?: string;
  createdAt: number;
}

export interface StoreState {
  activeBenchId: BenchId;
  benches: Map<BenchId, Bench>;
  repoPath: string;
}

export interface SerializedBench {
  id: BenchId;
  name: string;
  isDefault: boolean;
  files: Array<{ path: FilePath; hunks: HunkRef[] }>;
  commitMessageDraft?: string;
  createdAt: number;
}

export interface SerializedState {
  schemaVersion: 1;
  activeBenchId: BenchId;
  benches: SerializedBench[];
}

export type BenchChangeEvent =
  | { type: 'bench-created'; benchId: BenchId }
  | { type: 'bench-renamed'; benchId: BenchId }
  | { type: 'bench-deleted'; benchId: BenchId }
  | { type: 'active-changed'; previous: BenchId; next: BenchId }
  | { type: 'hunks-changed'; benchId: BenchId }
  | { type: 'draft-changed'; benchId: BenchId };
