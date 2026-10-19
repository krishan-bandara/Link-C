'use client';
/*
 * AuthShell({ children; smallSubtle?: boolean })
 *   Page wrapper: SkyBackground plus a centred <main> (safe areas, dvh). With smallSubtle the background switches
 *   to the 'subtle' intensity on screens up to 640px wide.
 */
import { useEffect, useState, type ReactNode } from 'react';
import SkyBackground from './SkyBackground';
import './auth.css';

export default function AuthShell({ children, smallSubtle = false }: { children: ReactNode; smallSubtle?: boolean }) {
  const [subtle, setSubtle] = useState(false);
  useEffect(() => {
    if (!smallSubtle) return;
    const mq = matchMedia('(max-width: 640px)');
    const on = () => setSubtle(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [smallSubtle]);
  return (
    <>
      <SkyBackground intensity={subtle ? 'subtle' : 'full'} />
      <main className="lc-main">{children}</main>
    </>
  );
}
