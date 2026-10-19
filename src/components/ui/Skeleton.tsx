import './ui.css';

/** Shimmering placeholder block. Size it with className (h-4 w-24, aspect-square, ...). */
export default function Skeleton({ className = '', round = false }: { className?: string; round?: boolean }) {
  return <span aria-hidden className={`skeleton block ${round ? 'rounded-full' : 'rounded-lg'} ${className}`} />;
}
