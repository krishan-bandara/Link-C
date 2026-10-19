'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/** Tiny toast: const { toast, node } = useToast(); render {node} once, call toast('Saved'). */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; bad: boolean; n: number } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((text: string, bad = false) => {
    clearTimeout(t.current);
    setMsg((m) => ({ text, bad, n: (m?.n ?? 0) + 1 }));
    t.current = setTimeout(() => setMsg(null), 2800);
  }, []);
  const node = (
    <div aria-live="polite" className="safe-bottom pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {msg && (
        <p
          key={msg.n}
          role="status"
          className={`pop glass flex max-w-full items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-main shadow-xl ${
            msg.bad ? 'border-danger' : 'ring-glow'
          }`}
          style={msg.bad ? { borderColor: 'var(--c-danger)' } : undefined}
        >
          {msg.bad ? <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
          <span className="min-w-0">{msg.text}</span>
        </p>
      )}
    </div>
  );
  return { toast, node };
}
