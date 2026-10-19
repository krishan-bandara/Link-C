import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';

/** Every admin page and the layout call this: the owner role is re-read from the database each time. */
export async function ownerOrRedirect() {
  try {
    return await requireOwner();
  } catch {
    redirect('/');
  }
}
