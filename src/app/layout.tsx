import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import SwRegister from '@/components/SwRegister';
import IdleGuard from '@/components/IdleGuard';
import PrivacyShield from '@/components/PrivacyShield';
import { ACCENT_COOKIE, DEFAULT_ACCENT, PACK_COOKIE, THEME_COOKIE, accentStyle, isHex, isPack, isTheme } from '@/lib/theme';
import './globals.css';
import '@/components/ui/ui.css';

export const metadata: Metadata = {
  title: 'Link-C',
  description: 'Private chat',
  robots: { index: false, follow: false }, // private app: keep it out of search engines
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Link-C', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f6fd' },
    { media: '(prefers-color-scheme: dark)', color: '#070b14' },
  ],
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers opts every page into per-request rendering, so Next can attach the CSP nonce.
  await headers();
  const jar = await cookies();
  const t = jar.get(THEME_COOKIE)?.value;
  const a = decodeURIComponent(jar.get(ACCENT_COOKIE)?.value ?? '');
  const theme = isTheme(t) ? t : 'light';
  const pk = jar.get(PACK_COOKIE)?.value;
  const pack = isPack(pk) ? pk : undefined;
  const accent = isHex(a) ? a : DEFAULT_ACCENT;
  return (
    <html lang="en" data-theme={theme} data-pack={pack} style={accentStyle(accent, pack)} suppressHydrationWarning>
      <body className="text-main antialiased">
        {children}
        <SwRegister />
        <IdleGuard />
        <PrivacyShield />
      </body>
    </html>
  );
}
