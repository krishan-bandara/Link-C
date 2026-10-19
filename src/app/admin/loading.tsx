export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton ad-skel-line w-48" />
        <div className="skeleton ad-skel-line w-72 max-w-full" />
      </div>
      <div className="ad-pgrid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton ad-skel" />
        ))}
      </div>
    </div>
  );
}
