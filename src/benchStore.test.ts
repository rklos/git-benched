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
