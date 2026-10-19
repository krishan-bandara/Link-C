import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './ui.css';

/** Small metric: gradient icon, big number, label. */
export default function StatTile({
  icon: Icon,
  label,
  value,
  className = '',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ui-stat ${className}`}>
      <span className="ui-icon-chip" style={{ height: '2.5rem', width: '2.5rem', borderRadius: '0.9rem' }}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="ui-stat-value ui-gtext">{value}</div>
        <div className="ui-stat-label truncate">{label}</div>
      </div>
    </div>
  );
}
