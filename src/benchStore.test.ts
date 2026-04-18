import { describe, it, expect } from 'vitest';
import { BenchStore } from './benchStore';

describe('BenchStore construction', () => {
  it('creates a Default Bench when initialized with no prior state', () => {
    const store = new BenchStore(undefined, '/fake/repo');
    const benches = store.getBenches();
    expect(benches).toHaveLength(1);
    expect(benches[0].name).toBe('Default Bench');
    expect(benches[0].isDefault).toBe(true);
  });

  it('makes the Default Bench active on first init', () => {
    const store = new BenchStore(undefined, '/fake/repo');
    const active = store.getActiveBench();
    expect(active.isDefault).toBe(true);
  });
});

describe('BenchStore CRUD', () => {
  it('creates a named bench', () => {
    const store = new BenchStore(undefined, '/r');
    const created = store.createBench('Feature A');
    expect(store.getBenches()).toHaveLength(2);
    expect(store.getBench(created.id)?.name).toBe('Feature A');
    expect(store.getBench(created.id)?.isDefault).toBe(false);
  });

  it('renames a bench', () => {
    const store = new BenchStore(undefined, '/r');
    const created = store.createBench('Old');
    store.renameBench(created.id, 'New');
    expect(store.getBench(created.id)?.name).toBe('New');
  });

  it('can rename the Default Bench', () => {
    const store = new BenchStore(undefined, '/r');
    const def = store.getDefaultBench();
    store.renameBench(def.id, 'My Default');
    expect(store.getDefaultBench().name).toBe('My Default');
  });

  it('deletes a non-default bench', () => {
    const store = new BenchStore(undefined, '/r');
    const b = store.createBench('Tmp');
    store.deleteBench(b.id);
    expect(store.getBenches()).toHaveLength(1);
  });

  it('refuses to delete the Default Bench', () => {
    const store = new BenchStore(undefined, '/r');
    const def = store.getDefaultBench();
    expect(() => store.deleteBench(def.id)).toThrow(/default/i);
  });

  it('fires bench-created / renamed / deleted events', () => {
    const store = new BenchStore(undefined, '/r');
    const events: string[] = [];
    store.onChange((e) => events.push(e.type));
    const b = store.createBench('X');
    store.renameBench(b.id, 'Y');
    store.deleteBench(b.id);
    expect(events).toEqual([ 'bench-created', 'bench-renamed', 'bench-deleted' ]);
  });
});

describe('BenchStore active switching', () => {
  it('changes the active bench and emits active-changed', () => {
    const store = new BenchStore(undefined, '/r');
    const b = store.createBench('Feature A');
    const events: string[] = [];
    store.onChange((e) => events.push(e.type));
    store.setActiveBench(b.id);
    expect(store.getActiveBench().id).toBe(b.id);
    expect(events).toContain('active-changed');
  });

  it('does nothing if target is already active', () => {
    const store = new BenchStore(undefined, '/r');
    const events: string[] = [];
    const activeId = store.getActiveBench().id;
    store.onChange((e) => events.push(e.type));
    store.setActiveBench(activeId);
    expect(events).toHaveLength(0);
  });

  it('throws when setting a nonexistent bench active', () => {
    const store = new BenchStore(undefined, '/r');
    expect(() => store.setActiveBench('nope')).toThrow();
  });
});
