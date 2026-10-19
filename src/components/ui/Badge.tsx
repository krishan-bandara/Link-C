import type { ReactNode } from 'react';
import './ui.css';

export type BadgeTone = 'grad' | 'accent' | 'muted' | 'danger' | 'success';

/** Small pill label or count. */
export default function Badge({
  tone = 'accent',
  className = '',
  children,
  ...rest
}: { tone?: BadgeTone; className?: string; children: ReactNode } & Omit<React.HTMLAttributes<HTMLSpanElement>, 'className' | 'children'>) {
  return (
    <span className={`ui-pill ui-pill-${tone} ${className}`} {...rest}>
      {children}
    </span>
  );
}
