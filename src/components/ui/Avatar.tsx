'use client';

import { useState } from 'react';

const COLORS = ['#c0392b', '#c2185b', '#8e24aa', '#5e35b1', '#1565c0', '#00796b', '#2e7d32', '#b45309', '#6d4c41', '#546e7a']; // dark enough for white initials (4.5:1)

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/**
 * Round profile picture. With an assetId it loads /api/avatar/<userId>?v=<assetId> (the v value busts the cache
 * when the picture changes); without one, or if loading fails, it shows a coloured circle with the first letter.
 */
export default function Avatar({
  userId,
  name,
  assetId,
  size = 40,
  className = '',
}: {
  userId: string;
  name: string;
  assetId?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, minWidth: size };
  if (assetId && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/avatar/${userId}?v=${assetId}`}
        alt=""
        onError={() => setFailed(true)}
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: colorFor(userId), fontSize: size * 0.42 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
