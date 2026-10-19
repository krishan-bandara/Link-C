import type { Metadata } from 'next';
import InviteForm from './InviteForm';

// The link carries a one-time token: keep it out of search engines and out of Referer headers.
export const metadata: Metadata = {
  title: 'Create your account',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteForm token={token} />;
}
