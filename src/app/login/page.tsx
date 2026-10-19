import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

const NOTICES: Record<string, string> = {
  idle: 'You were signed out after 1 minute of inactivity. Please sign in again.',
  disabled: 'Your login has been disabled. Contact the administrator.',
  ended: 'Your session ended. Please sign in again. If this keeps happening, contact the administrator.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const notice = reason && Object.hasOwn(NOTICES, reason) ? NOTICES[reason] : '';
  return <LoginForm notice={notice} />;
}
