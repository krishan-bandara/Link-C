// In-memory fake of the small supabase-js query surface that worker/index.ts uses.
// State lives on globalThis so it is shared across vi.resetModules() (mock factories re-run).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null; count?: number | null };

export interface FakeState {
  tables: Record<string, Row[]>;
  seq: number;
  /** every query run, as `op:table` (to assert which queries were or were not made) */
  log: string[];
}
const G = globalThis as unknown as { __fakeDb?: FakeState };

export function resetFakeDb(): FakeState {
  G.__fakeDb = { tables: {}, seq: 0, log: [] };
  return G.__fakeDb;
}
export function fakeDb(): FakeState {
  return G.__fakeDb ?? resetFakeDb();
}
export const rows = (t: string): Row[] => (fakeDb().tables[t] ??= []);

const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : NaN);
function cmp(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null; // SQL null never matches
  const x = ms(a);
  const y = ms(b);
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return (a as any) < (b as any) ? -1 : (a as any) > (b as any) ? 1 : 0;
}

function defaults(table: string, row: Row): Row {
  const now = new Date().toISOString();
  const r = { ...row };
  if (table === 'presence_state') {
    r.last_seen_at ??= now; // column default now()
    r.sms_step ??= 0;
    r.sms_sent_this_period ??= false;
    r.last_sms_at ??= null;
    r.sms_first_at ??= null;
    r.sms_last_sent_at ??= null;
  }
  if (table === 'sms_log') {
    r.id ??= ++fakeDb().seq;
    r.sent_at ??= now;
  }
  return r;
}

const SPECIAL = '.*+?^$' + '{}()|[]' + String.fromCharCode(92);
function likeRe(pat: string): RegExp {
  let out = '';
  for (const ch of pat) out += ch === '%' ? '.*' : SPECIAL.includes(ch) ? String.fromCharCode(92) + ch : ch;
  return new RegExp('^' + out + '$');
}

class Q implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: any;
  private filters: ((r: Row) => boolean)[] = [];
  private head = false;
  private count = false;
  private returning = false;
  private shape: 'none' | 'maybe' | 'one' = 'none';
  private conflict = 'id';
  private ignoreDup = false;
  private lim: number | null = null;
  constructor(private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.head = !!opts?.head;
      this.count = !!opts?.count;
    } else this.returning = true;
    return this;
  }
  insert(p: Row | Row[]) { this.op = 'insert'; this.payload = p; return this; }
  update(p: Row) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  upsert(p: Row, o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert'; this.payload = p; this.conflict = o?.onConflict ?? 'id'; this.ignoreDup = !!o?.ignoreDuplicates; return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => { const d = cmp(r[c], v); return d !== null && d < 0; }); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => { const d = cmp(r[c], v); return d !== null && d >= 0; }); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === 'like') this.filters.push((r) => !(typeof r[c] === 'string' && likeRe(String(v)).test(r[c])));
    else this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v));
    return this;
  }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  like(c: string, pat: string) {
    this.filters.push((r) => typeof r[c] === 'string' && likeRe(pat).test(r[c]));
    return this;
  }
  or(_expr: string) { return this; } // housekeeping only; its tables are empty in tests
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.shape = 'maybe'; return this; }
  // The real client: .single() errors when not exactly one row.
  singleRow() { this.shape = 'one'; return this; }

  private run(): Result {
    fakeDb().log.push(`${this.op}:${this.table}`);
    const t = rows(this.table);
    const match = () => t.filter((r) => this.filters.every((f) => f(r)));
    const out = (rs: Row[]): Result => {
      const c = rs.map((r) => ({ ...r }));
      if (this.shape === 'none') return { data: c, error: null };
      if (this.shape === 'one' && c.length !== 1) return { data: null, error: { message: 'not exactly one row' } };
      return { data: c[0] ?? null, error: null };
    };
    switch (this.op) {
      case 'select': {
        let rs = match();
        if (this.lim !== null) rs = rs.slice(0, this.lim);
        if (this.head) return { data: null, error: null, count: this.count ? rs.length : null };
        const r = out(rs);
        if (this.count) r.count = rs.length;
        return r;
      }
      case 'insert': {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => defaults(this.table, p));
        t.push(...list);
        return this.returning ? out(list) : { data: null, error: null };
      }
      case 'update': {
        const rs = match();
        for (const r of rs) Object.assign(r, this.payload);
        return this.returning ? out(rs) : { data: null, error: null };
      }
      case 'delete': {
        const rs = match();
        fakeDb().tables[this.table] = t.filter((r) => !rs.includes(r));
        return { data: null, error: null };
      }
      case 'upsert': {
        const ex = t.find((r) => r[this.conflict] === this.payload[this.conflict]);
        if (!ex) t.push(defaults(this.table, this.payload));
        else if (!this.ignoreDup) Object.assign(ex, this.payload);
        return { data: null, error: null };
      }
    }
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
}

/** Same rules as public.sms_candidates_v2 (supabase/migrations/20261022000020_sms_repeat_schedule.sql). */
function smsCandidatesV2(offlineSeconds: number): Row[] {
  const cutoff = Date.now() - offlineSeconds * 1000;
  const groups = new Map<string, Row>();
  for (const m of rows('messages')) {
    if (m.read_at != null || m.type === 'system') continue;
    const c = rows('conversations').find((x) => x.id === m.conversation_id);
    if (!c) continue;
    const rid = c.user_a === m.sender_id ? c.user_b : c.user_a;
    const r = rows('profiles').find((x) => x.id === rid);
    if (!r || r.login_disabled || !r.sms_alerts_enabled || r.phone_enc == null) continue;
    const p = rows('presence_state').find((x) => x.user_id === rid);
    const seen = p?.last_seen_at == null ? -Infinity : Date.parse(p.last_seen_at);
    if (!(seen < cutoff)) continue;
    const g = groups.get(rid);
    if (g) {
      if (Date.parse(m.created_at) < Date.parse(g.first_unread)) g.first_unread = m.created_at;
    } else {
      groups.set(rid, {
        user_id: rid,
        first_unread: m.created_at,
        step: p?.sms_step ?? 0,
        sms_first_at: p?.sms_first_at ?? null,
        sms_last_sent_at: p?.sms_last_sent_at ?? null,
        last_sms_at: p?.last_sms_at ?? null,
      });
    }
  }
  return [...groups.values()];
}

export function makeFakeClient() {
  return {
    from: (t: string) => {
      const q = new Q(t);
      // supabase-js exposes .single(); keep the internal name collision-free.
      (q as any).single = () => q.singleRow();
      return q;
    },
    rpc: async (fn: string, args: { p_offline_seconds: number }): Promise<Result> => {
      if (fn === 'sms_candidates_v2') return { data: smsCandidatesV2(args.p_offline_seconds), error: null };
      if (fn === 'push_candidates') return { data: [], error: null };
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
  };
}
