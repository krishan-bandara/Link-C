import './chat.css';

const ROWS: { mine: boolean; w: string; h: string }[] = [
  { mine: false, w: 'w-44', h: 'h-10' },
  { mine: false, w: 'w-60', h: 'h-14' },
  { mine: true, w: 'w-52', h: 'h-10' },
  { mine: true, w: 'w-36', h: 'h-10' },
  { mine: false, w: 'w-56', h: 'h-12' },
  { mine: true, w: 'w-64', h: 'h-16' },
];

/** Shimmering placeholder bubbles shown while a conversation loads. */
export default function ChatSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app" role="status" aria-label="Loading conversation">
      <div className="glass cv-header safe-top flex items-center gap-3 px-3 py-2.5">
        <div className="skeleton h-10 w-10 rounded-full" />
        <div className="space-y-1.5">
          <div className="skeleton h-3.5 w-32 rounded-full" />
          <div className="skeleton h-2.5 w-20 rounded-full" />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-3 py-4">
        {ROWS.map((r, i) => (
          <div key={i} className={`flex ${r.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`skeleton cv-skel max-w-[80%] ${r.w} ${r.h}`} style={{ animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
      <div className="cv-composer safe-bottom px-2 py-2">
        <div className="skeleton h-11 rounded-3xl" />
      </div>
    </div>
  );
}
