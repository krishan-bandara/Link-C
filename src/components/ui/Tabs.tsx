'use client';

import { useRef, type ReactNode } from 'react';
import './ui.css';

export type TabItem = { id: string; label: string; icon?: ReactNode };

/** Equal-width tab strip with an animated gradient underline. Arrow keys, Home and End move between tabs. */
export default function Tabs({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, tabs.findIndex((t) => t.id === value));

  function key(e: React.KeyboardEvent, i: number) {
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={`ui-tabs ${className}`} style={{ ['--n' as string]: tabs.length, ['--i' as string]: idx }}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => key(e, i)}
          className="ui-tab"
        >
          {t.icon}
          {t.label}
        </button>
      ))}
      <span className="ui-tabs-bar" aria-hidden />
    </div>
  );
}
