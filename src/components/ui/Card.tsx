import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './ui.css';

type Pad = 'none' | 'sm' | 'md' | 'lg';

/** Frosted-glass card. `interactive` adds hover lift + glow (use it on links and buttons, via `as`). */
export default function Card({
  as,
  interactive = false,
  padding = 'md',
  className = '',
  children,
  ...rest
}: {
  as?: ElementType;
  interactive?: boolean;
  padding?: Pad;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> &
  Record<string, unknown>) {
  const Tag: ElementType = as ?? 'div';
  const pad = padding === 'none' ? '' : `ui-card-p-${padding}`;
  return (
    <Tag className={`glass ui-card ${pad} ${interactive ? 'ui-card-hover' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Gradient icon square + title, the usual head of a section card. */
export function CardTitle({ icon: Icon, children, id }: { icon?: LucideIcon; children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="ui-card-title">
      {Icon && (
        <span className="ui-icon-chip">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}
      <span>{children}</span>
    </h2>
  );
}
