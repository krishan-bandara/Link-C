import '../members/members.css';

/** Skeleton cards shown while the Members page loads (same grid as the real page, so nothing jumps). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <span className="sr-only">Loading people</span>
      <div className="skeleton" style={{ height: 40, width: 'min(100%, 420px)', borderRadius: 999 }} />
      <ul className="ad-pgrid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="skeleton mb-skel" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </ul>
    </div>
  );
}
