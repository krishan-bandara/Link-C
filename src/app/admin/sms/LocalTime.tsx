'use client';

import { useEffect, useState } from 'react';

/** Shows an ISO timestamp in the viewer's own time zone and locale. */
export function LocalTime({ iso }: { iso: string }) {
  // Empty on the server so the server's UTC text never shows as local time.
  const [text, setText] = useState('');
  useEffect(() => {
    setText(new Date(iso).toLocaleString());
  }, [iso]);
  return <time dateTime={iso}>{text || ' '}</time>;
}
