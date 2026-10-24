'use client';
import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    // updateViaCache 'none': a new sw.js is always fetched from the network, never from the HTTP cache
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  }, []);
  return null;
}
