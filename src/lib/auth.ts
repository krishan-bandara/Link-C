import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

import { HttpError } from '@/lib/errors';

export { HttpError };

/** Validates the session with the auth server. Throws HttpError(401) when not signed in. */
export async function requireUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, 'Not signed in');
  return { user, supabase };
}

/** Owner role is read from the database on every call, never trusted from the client. */
export async function requireOwner() {
  const ctx = await requireUser();
  const { data } = await adminClient().from('profiles').select('role').eq('id', ctx.user.id).single();
  if (data?.role !== 'owner') throw new HttpError(403, 'Owner only');
  return ctx;
}

/** Confirms the signed-in user is in the conversation (uses RLS) and returns the other participant's id. */
export async function requireConversation(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  conversationId: string,
) {
  const { data } = await supabase
    .from('conversations')
    .select('id,user_a,user_b')
    .eq('id', conversationId)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'Conversation not found');
  return { id: data.id as string, otherId: (data.user_a === userId ? data.user_b : data.user_a) as string };
}

export async function audit(actorId: string | null, action: string, target?: string) {
  // Never put message content or secret values in here.
  await adminClient().from('audit_log').insert({ actor_id: actorId, action, target: target ?? null });
}

type Handler<A extends unknown[]> = (...args: A) => Promise<Response>;

/** Wraps a route handler: HttpError -> status, ZodError -> 400, anything else -> generic 500 (logged, not leaked). */
export function handle<A extends unknown[]>(fn: Handler<A>): Handler<A> {
  return async (...args: A) => {
    try {
      // Cross-site request forgery guard for every route that changes something: if the browser says where the request
      // came from, it must be this site (SameSite cookies are the second layer).
      const req = args[0];
      if (req instanceof Request && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers.get('origin');
        if (origin) {
          const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
          let originHost = '';
          try {
            originHost = new URL(origin).host;
          } catch {
            /* malformed origin: refused below */
          }
          if (originHost !== host && originHost !== new URL(req.url).host && origin !== (process.env.APP_URL ?? '').replace(/\/$/, '')) {
            throw new HttpError(403, 'Not allowed');
          }
        }
      }
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError || e instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }
      console.error('route error', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }
  };
}
