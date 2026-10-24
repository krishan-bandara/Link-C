// Validation for the Do-not-disturb form (pure, no react).
import { parseHm, type Dnd } from '@/lib/chatprefs';

export type DndCheck = { ok: boolean; warn: string };

export function checkDnd(d: Pick<Dnd, 'from' | 'to'>): DndCheck {
  if (parseHm(d.from) === null || parseHm(d.to) === null) return { ok: false, warn: 'Enter both times as hours and minutes.' };
  if (d.from === d.to) return { ok: true, warn: 'From and To are the same, so quiet hours never apply. Pick two different times.' };
  return { ok: true, warn: '' };
}
