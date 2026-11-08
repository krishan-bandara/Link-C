import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEDIA_COLS, MSG_COLS, SHARE_COLS } from '@/lib/chat/types';

// Guards against "added a column to the browser select list but forgot the column grant" (the media_items.hd bug).
// Handles two statement shapes (case-insensitive, may span lines, SQL comments ignored):
//   grant select (a, b) on public.<table> to authenticated;   -> those columns
//   grant select on public.<table> to authenticated;          -> table-wide, every column (also future ones)
// Revokes are not modelled; none exist for these tables today.
const dir = path.join(process.cwd(), 'supabase', 'migrations');

function loadSql(): string {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function grants(sql: string) {
  const cols = new Map<string, Set<string>>();
  const wide = new Set<string>();
  const re = /grant\s+select\s*(\(([^)]*)\))?\s*on\s+(?:table\s+)?(?:public\.)?"?(\w+)"?\s+to\s+([^;]*);/gi;
  for (const m of sql.matchAll(re)) {
    if (!/\bauthenticated\b/i.test(m[4])) continue;
    const table = m[3];
    if (!m[1]) {
      wide.add(table);
      continue;
    }
    const set = cols.get(table) ?? new Set<string>();
    for (const c of m[2].split(',')) set.add(c.trim().replace(/"/g, ''));
    cols.set(table, set);
  }
  return { cols, wide };
}

const { cols, wide } = grants(loadSql());

describe('browser select lists are covered by column grants', () => {
  const cases: [string, string, string][] = [
    ['media_items', 'MEDIA_COLS', MEDIA_COLS],
    ['messages', 'MSG_COLS', MSG_COLS],
    ['location_shares', 'SHARE_COLS', SHARE_COLS],
  ];
  it('parser finds grants', () => {
    expect(cols.get('media_items')?.size).toBeGreaterThan(5);
  });
  for (const [table, label, list] of cases) {
    it(`${label} is granted on ${table}`, () => {
      const missing = list
        .split(',')
        .map((c) => c.trim())
        .filter((c) => !wide.has(table) && !cols.get(table)?.has(c));
      expect(missing, `columns not granted select on ${table}`).toEqual([]);
    });
  }
});
