import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({}) }));
vi.mock('@/lib/storage', () => ({ dataDir: () => '', rm: async () => {}, storeFor: () => ({}) }));

const { isVisibleToViewer } = await import('@/lib/media');

describe('isVisibleToViewer (delete for me / clear chat)', () => {
  const created = '2026-10-19T10:00:00Z';
  it('is visible when nothing was cleared or hidden', () => {
    expect(isVisibleToViewer({ createdAt: created })).toBe(true);
    expect(isVisibleToViewer({ createdAt: created, clearedAt: null, hidden: false })).toBe(true);
  });
  it('is hidden when the viewer hid it', () => {
    expect(isVisibleToViewer({ createdAt: created, hidden: true })).toBe(false);
  });
  it('is hidden when created before or exactly at the clear time', () => {
    expect(isVisibleToViewer({ createdAt: created, clearedAt: '2026-10-19T11:00:00Z' })).toBe(false);
    expect(isVisibleToViewer({ createdAt: created, clearedAt: created })).toBe(false);
  });
  it('is visible when created after the clear time', () => {
    expect(isVisibleToViewer({ createdAt: new Date(created), clearedAt: new Date('2026-10-19T09:00:00Z') })).toBe(true);
  });
  it('hidden wins even after the clear time', () => {
    expect(isVisibleToViewer({ createdAt: created, clearedAt: '2026-10-19T09:00:00Z', hidden: true })).toBe(false);
  });
});
