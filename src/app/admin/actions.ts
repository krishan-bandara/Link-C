'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit, HttpError, requireOwner } from '@/lib/auth';
import { decryptText, encryptText } from '@/lib/crypto';
import { isUnreadablePhone, readPhone } from '@/lib/phone';
import { createInviteToken } from '@/lib/invites';
import { createStickerPack, deletePack, deleteUserAssets, removePackSticker } from '@/lib/assets';
import { deleteMediaBlobs } from '@/lib/media';
import { sendSms, validateE164 } from '@/lib/sms';
import { assertPublicHttpsUrl } from '@/lib/ssrf';
import { adminClient } from '@/lib/supabase/admin';

type State = { ok?: boolean; message?: string; link?: string; expiresAt?: string } | null;

const ok = (message: string, extra: { link?: string; expiresAt?: string } = {}): State => ({ ok: true, message, ...extra });
const err = (message: string): State => ({ ok: false, message });

/** Runs an owner-only action: re-checks the owner role, maps errors to a safe message. */
async function owned(fn: (ownerId: string, user: { last_sign_in_at?: string }) => Promise<State>): Promise<State> {
  try {
    const { user } = await requireOwner();
    return await fn(user.id, user);
  } catch (e) {
    if (e instanceof HttpError) return err(e.status === 403 ? 'Owner only' : 'Please sign in again');
    if (e instanceof z.ZodError) {
      const i = e.issues[0];
      const field = String(i?.path?.[0] ?? '').replace(/_/g, ' ');
      const msg = i?.message ?? 'Invalid input';
      // Zod's own wording ("Too small: expected number...") is cryptic, so name the field and keep it short.
      if (field && /expected string/.test(msg)) return err(`${field}: too long or too short`);
      return err(field && /^(Too |Invalid input)/.test(msg) ? `${field}: value is out of range or not a whole number` : msg);
    }
    if (e instanceof Error && e.name === 'UserError') return err(e.message);
    console.error('admin action error', e instanceof Error ? e.message : 'unknown');
    return err('Something went wrong');
  }
}

class UserError extends Error {
  name = 'UserError';
}

const uuid = z.string().uuid();
const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

/** Finds a Supabase auth user by (lower-cased) email. The user list is tiny (a private chat app). */
async function findAuthUserByEmail(email: string) {
  const db = adminClient();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new UserError('Could not look up accounts');
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Deletes a pending invitation and makes every unused link for that email stop working. */
async function dropInvite(email: string) {
  const db = adminClient();
  await db.from('invites').delete().eq('email', email);
  await db.from('invite_tokens').delete().eq('email', email);
}


// ------------------------------------------------------------------ members
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  display_name: z.string().trim().min(1, 'Name is required').max(40),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, ''))
    .refine((s) => s === '' || validateE164(s), 'Phone must be in E.164 format, e.g. +94771234567'),
});

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const LINK_NOTE = 'Works once, for 24 hours.';

/** Texts a sign-up or reset link to the person's phone. Returns a short sentence to add to the on-screen message. */
async function textLink(raw: string | null | undefined, link: string, userId: string | null, reset: boolean): Promise<string> {
  const phone = readPhone(raw);
  if (!phone) {
    return isUnreadablePhone(raw)
      ? ' The saved number is unreadable. Re-enter it in the member menu under Phone number.'
      : ' No phone number on file, so no text was sent.';
  }
  const text = reset
    ? `Link-C: open this link to set a new password: ${link} (works once, 24 hours)`
    : `You are invited to Link-C. Open this link to set up your account: ${link} (works once, 24 hours)`;
  try {
    const r = await sendSms({ to: phone, text, userId, kind: 'invite' });
    if (r.ok) return ' Link sent by text message.';
    return r.status === 'sms disabled' ? ' Text messages are turned off in Admin > SMS, so no text was sent.' : ' The text message could not be sent. Copy the link below instead.';
  } catch {
    return ' The text message could not be sent. Copy the link below instead.';
  }
}

export async function createInvite(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const input = inviteSchema.parse({
      email: blank(fd.get('email')),
      display_name: blank(fd.get('display_name')),
      phone: blank(fd.get('phone')),
    });
    const db = adminClient();
    // A profile always belongs to an auth user, so checking auth users covers both.
    if ((await findAuthUserByEmail(input.email)) !== null) throw new UserError('This person already has an account. Use "Reset password link" on their card instead.');

    // Not an upsert: the unique index is on lower(email), which a plain ON CONFLICT (email) cannot use.
    const row = {
      email: input.email,
      display_name: input.display_name,
      role: 'member',
      phone_enc: input.phone || null, // plain E.164 text (see src/lib/phone.ts)
      invited_by: ownerId,
      accepted_at: null,
    };
    const { data: existing } = await db
      .from('invites')
      .select('id')
      .ilike('email', input.email.replace(/[\\%_]/g, (c) => '\\' + c))
      .maybeSingle();
    const { data: inv, error: invErr } = existing
      ? await db.from('invites').update(row).eq('id', existing.id).select('id').single()
      : await db.from('invites').insert(row).select('id').single();
    if (invErr || !inv) throw new UserError('Could not save the invitation');

    const t = await createInviteToken({ email: input.email, purpose: 'invite', createdBy: ownerId });
    await audit(ownerId, 'member_invited', inv.id as string);
    revalidatePath('/admin/members');
    revalidatePath('/admin');
    const sms = await textLink(input.phone || null, t.link, null, false);
    return ok(`Invitation ready. ${LINK_NOTE}${sms}`, { link: t.link, expiresAt: t.expiresAt });
  });
}

export async function regenerateInvite(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const email = emailSchema.parse(blank(fd.get('email')));
    const { data: inv } = await adminClient().from('invites').select('id,accepted_at,phone_enc').eq('email', email).maybeSingle();
    if (!inv || inv.accepted_at) throw new UserError('No pending invitation for that email');
    const t = await createInviteToken({ email, purpose: 'invite', createdBy: ownerId });
    await audit(ownerId, 'invite_regenerated', inv.id as string);
    revalidatePath('/admin/members');
    const sms = await textLink(inv.phone_enc as string | null, t.link, null, false);
    return ok(`New link ready. The old one no longer works. ${LINK_NOTE}${sms}`, { link: t.link, expiresAt: t.expiresAt });
  });
}

export async function revokeInvite(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const email = emailSchema.parse(blank(fd.get('email')));
    const db = adminClient();
    const { data: inv } = await db.from('invites').select('id,accepted_at').eq('email', email).maybeSingle();
    if (!inv || inv.accepted_at) throw new UserError('No pending invitation for that email');
    await dropInvite(email);
    await audit(ownerId, 'invite_revoked', inv.id as string);
    revalidatePath('/admin/members');
    revalidatePath('/admin');
    return ok('Invitation revoked.');
  });
}

export async function resetPasswordLink(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const memberId = uuid.parse(fd.get('memberId'));
    const { data } = await adminClient().auth.admin.getUserById(memberId);
    const email = data.user?.email?.toLowerCase();
    if (!email) throw new UserError('Member not found');
    const t = await createInviteToken({ email, purpose: 'reset', createdBy: ownerId });
    await audit(ownerId, 'password_reset_link_created', memberId);
    const { data: prof } = await adminClient().from('profiles').select('phone_enc').eq('id', memberId).maybeSingle();
    const sms = await textLink(prof?.phone_enc as string | null | undefined, t.link, memberId, true);
    return ok(`Reset link ready. ${LINK_NOTE}${sms}`, { link: t.link, expiresAt: t.expiresAt });
  });
}

export async function setLoginDisabled(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const memberId = uuid.parse(fd.get('memberId'));
    const disabled = z.enum(['true', 'false']).parse(fd.get('disabled')) === 'true';
    if (memberId === ownerId) throw new UserError('You cannot disable your own login');
    const db = adminClient();
    const { data: target } = await db.from('profiles').select('role').eq('id', memberId).maybeSingle();
    if (!target) throw new UserError('Member not found');
    if (target.role === 'owner') throw new UserError('An owner login cannot be disabled');

    const { error: banErr } = await db.auth.admin.updateUserById(memberId, { ban_duration: disabled ? '876000h' : 'none' });
    if (banErr) throw new UserError('Could not update the login');
    if (disabled) {
      const { error: rpcErr } = await db.rpc('revoke_user_sessions', { p_user: memberId });
      if (rpcErr) console.error('revoke_user_sessions failed');
    }
    const { error } = await db.from('profiles').update({ login_disabled: disabled }).eq('id', memberId);
    if (error) throw new UserError('Could not save the change');
    await audit(ownerId, disabled ? 'login_disabled' : 'login_enabled', memberId);
    revalidatePath('/admin/members');
    revalidatePath('/admin');
    return ok(disabled ? 'Login disabled. They are signed out within seconds.' : 'Login enabled. They can sign in again.');
  });
}

export async function toggleMemberSms(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const memberId = uuid.parse(fd.get('memberId'));
    const on = z.enum(['true', 'false']).parse(fd.get('on')) === 'true';
    const { error } = await adminClient().from('profiles').update({ sms_alerts_enabled: on }).eq('id', memberId);
    if (error) throw new UserError('Update failed');
    await audit(ownerId, on ? 'member_sms_enabled' : 'member_sms_disabled', memberId);
    revalidatePath('/admin/members');
    return ok(on ? 'SMS alerts on.' : 'SMS alerts off.');
  });
}

/** Owner sets or clears a member's phone number (stored as plain E.164). Also the way to re-enter a number that could not be read. */
export async function setMemberPhone(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const memberId = uuid.parse(fd.get('memberId'));
    const phone = z
      .string()
      .trim()
      .transform((s) => s.replace(/[\s-]/g, ''))
      .refine((s) => s === '' || validateE164(s), 'Phone must be in E.164 format, e.g. +94771234567')
      .parse(blank(fd.get('phone')));
    const db = adminClient();
    const { data: before } = await db.from('profiles').select('phone_enc').eq('id', memberId).maybeSingle();
    if (!before) throw new UserError('Member not found');
    const changed = ((before.phone_enc as string | null) ?? '') !== phone;
    const patch: Record<string, unknown> = { phone_enc: phone || null };
    if (changed) patch.phone_verified_at = null;
    const { data: hit, error } = await db.from('profiles').update(patch).eq('id', memberId).select('id').maybeSingle();
    if (error) throw new UserError('Update failed');
    if (!hit) throw new UserError('Member not found');
    await audit(ownerId, 'member_phone_changed', memberId);
    revalidatePath('/admin/members');
    return ok(phone ? 'Phone number saved.' : 'Phone number removed.');
  });
}

export async function setMemberSmsTemplate(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const memberId = uuid.parse(fd.get('memberId'));
    const text = z.string().trim().max(160, 'Max 160 characters').parse(blank(fd.get('template_text')));
    const { error } = await adminClient()
      .from('profiles')
      .update({ sms_template: text || null })
      .eq('id', memberId);
    if (error) throw new UserError('Update failed');
    await audit(ownerId, 'member_sms_template_changed', memberId);
    revalidatePath('/admin/members');
    return ok(text ? 'Template saved.' : 'Template cleared (default is used).');
  });
}

export async function removeMember(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const memberId = uuid.parse(fd.get('memberId'));
    if (memberId === ownerId) throw new UserError('You cannot remove yourself');
    const db = adminClient();
    const { data: target } = await db.from('profiles').select('role').eq('id', memberId).maybeSingle();
    if (!target) throw new UserError('Member not found');
    if (target.role === 'owner') throw new UserError('An owner cannot be removed');

    const { data: convs } = await db.from('conversations').select('id').or(`user_a.eq.${memberId},user_b.eq.${memberId}`);
    const convIds = (convs ?? []).map((c) => c.id as string);
    if (convIds.length) {
      const { data: media } = await db.from('media_items').select('id').in('conversation_id', convIds);
      for (const m of media ?? []) await deleteMediaBlobs(m.id as string);
    }
    await deleteUserAssets(memberId);
    const { data: u } = await db.auth.admin.getUserById(memberId);
    const { error } = await db.auth.admin.deleteUser(memberId);
    if (error) throw new UserError('Could not remove the member');
    if (u.user?.email) await dropInvite(u.user.email.toLowerCase());
    await audit(ownerId, 'member_removed', memberId);
    revalidatePath('/admin/members');
    revalidatePath('/admin');
    return ok('Member removed.');
  });
}

// ------------------------------------------------------------------ official sticker packs
// Images are uploaded through /api/admin/stickers (server actions have a 1 MB body limit).
export async function createPack(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const name = z.string().trim().min(1, 'Pack name is required').max(40, 'Pack name max 40 characters').parse(blank(fd.get('name')));
    const packId = await createStickerPack(name, ownerId);
    await audit(ownerId, 'sticker_pack_created', packId);
    revalidatePath('/admin/stickers');
    return ok('Pack created.');
  });
}

export async function removePack(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const packId = uuid.parse(fd.get('packId'));
    await deletePack(packId);
    await audit(ownerId, 'sticker_pack_deleted', packId);
    revalidatePath('/admin/stickers');
    return ok('Pack deleted.');
  });
}

export async function removeSticker(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const stickerId = uuid.parse(fd.get('stickerId'));
    await removePackSticker(stickerId);
    await audit(ownerId, 'sticker_removed', stickerId);
    revalidatePath('/admin/stickers');
    return ok('Sticker removed.');
  });
}

// ------------------------------------------------------------------ SMS settings
const FRESH_LOGIN_MS = 15 * 60 * 1000;

const smsSchema = z.object({
  enabled: z.boolean(),
  api_url: z.string().trim().max(500),
  http_method: z.enum(['POST', 'GET']),
  request_format: z.enum(['json', 'form', 'query']),
  body_template: z.string().max(2000),
  headers_template: z.string().max(2000),
  sender_id: z.string().trim().max(40),
  template_text: z.string().trim().min(1, 'SMS text is required').max(160, 'SMS text max 160 characters'),
  offline_after_seconds: z.coerce.number().int().min(30, 'Offline delay must be at least 30 seconds').max(86400),
  step2_after_minutes: z.coerce.number().int().min(1, 'SMS 2 delay: 1 to 1440 minutes').max(1440, 'SMS 2 delay: 1 to 1440 minutes'),
  repeat_every_minutes: z.coerce.number().int().min(1, 'Repeat delay: 1 to 1440 minutes').max(1440, 'Repeat delay: 1 to 1440 minutes'),
  template_step2: z.string().trim().max(160, 'SMS 2 text max 160 characters'),
  template_step3: z.string().trim().max(160, 'SMS 3 and later text max 160 characters'),
  daily_cap: z.coerce.number().int().min(0).max(1000),
  monthly_cap: z.coerce.number().int().min(0).max(100000),
  quiet_start: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Quiet hours: use HH:MM (00:00 to 23:59)'),
  quiet_end: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Quiet hours: use HH:MM (00:00 to 23:59)'),
});

function requireFreshLogin(user: { last_sign_in_at?: string }, what: string) {
  const last = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  if (!last || Date.now() - last > FRESH_LOGIN_MS) {
    throw new UserError(`${what} needs a fresh login (within the last 15 minutes). Sign out, sign in again, then retry.`);
  }
}

const nl = (t: string) => t.split('\r\n').join('\n').split('\r').join('\n');

const stubPlaceholders = (t: string) => t.replace(/\{(to|text|sender|apiKey|apiSecret|basicAuth|toDigits)\}/g, 'x');

export async function saveSmsSettings(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId, user) => {
    const g = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
    const i = smsSchema.parse({
      enabled: fd.get('enabled') === 'on',
      api_url: g('api_url'),
      http_method: g('http_method'),
      request_format: g('request_format'),
      body_template: nl(g('body_template')),
      headers_template: nl(g('headers_template')),
      sender_id: g('sender_id'),
      template_text: g('template_text'),
      offline_after_seconds: g('offline_after_seconds'),
      step2_after_minutes: g('step2_after_minutes'),
      repeat_every_minutes: g('repeat_every_minutes'),
      template_step2: g('template_step2'),
      template_step3: g('template_step3'),
      daily_cap: g('daily_cap'),
      monthly_cap: g('monthly_cap'),
      quiet_start: g('quiet_start'),
      quiet_end: g('quiet_end'),
    });
    const apiKey = g('apiKey').trim();
    const apiSecret = g('apiSecret').trim();

    if (i.api_url) {
      try {
        assertPublicHttpsUrl(i.api_url);
      } catch (e) {
        throw new UserError(`API URL: ${e instanceof Error ? e.message : 'invalid'}`);
      }
    }
    try {
      const h: unknown = JSON.parse(stubPlaceholders(i.headers_template || '{}'));
      if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error();
    } catch {
      throw new UserError('Headers template must be a JSON object');
    }
    if (i.request_format === 'json') {
      try {
        JSON.parse(stubPlaceholders(i.body_template));
      } catch {
        throw new UserError('Body template must be valid JSON for the json format');
      }
    }
    if (i.enabled && !i.api_url) throw new UserError('Set an API URL before enabling SMS');

    const db = adminClient();
    const { data: cur } = await db.from('sms_settings').select('*').eq('id', 1).single();
    if (!cur) throw new UserError('Settings row missing');

    const sensitive =
      (i.api_url || null) !== cur.api_url ||
      !!apiKey ||
      !!apiSecret ||
      i.body_template !== nl(cur.body_template ?? '') ||
      i.headers_template !== nl(cur.headers_template ?? '') ||
      i.template_text !== cur.template_text ||
      (i.template_step2 || null) !== (cur.template_step2 ?? null) ||
      (i.template_step3 || null) !== (cur.template_step3 ?? null) ||
      i.http_method !== cur.http_method ||
      i.request_format !== cur.request_format;
    if (sensitive) {
      requireFreshLogin(user, 'Changing the URL, credentials, request format or templates');
    }

    const update: Record<string, unknown> = {
      enabled: i.enabled,
      api_url: i.api_url || null,
      http_method: i.http_method,
      request_format: i.request_format,
      body_template: i.body_template,
      headers_template: i.headers_template || '{}',
      sender_id: i.sender_id || null,
      template_text: i.template_text,
      offline_after_seconds: i.offline_after_seconds,
      step2_after_minutes: i.step2_after_minutes,
      repeat_every_minutes: i.repeat_every_minutes,
      template_step2: i.template_step2 || null,
      template_step3: i.template_step3 || null,
      daily_cap: i.daily_cap,
      monthly_cap: i.monthly_cap,
      quiet_start: i.quiet_start || null,
      quiet_end: i.quiet_end || null,
      updated_at: new Date().toISOString(),
    };
    if (apiKey || apiSecret) {
      let existing: { apiKey?: string; apiSecret?: string } = {};
      try {
        if (cur.credentials_enc) existing = JSON.parse(decryptText(cur.credentials_enc));
      } catch {
        if (!apiKey || !apiSecret) {
          throw new UserError('The stored credentials cannot be read: enter both the API key and the API secret.');
        }
        existing = {};
      }
      update.credentials_enc = encryptText(
        JSON.stringify({ apiKey: apiKey || existing.apiKey, apiSecret: apiSecret || existing.apiSecret }),
      );
    }
    const { error } = await db.from('sms_settings').update(update).eq('id', 1);
    if (error) {
      console.error('sms_settings update failed:', error.message);
      throw new UserError('Could not save settings. If you just updated the app, apply the latest database migration.');
    }
    await audit(ownerId, 'sms_settings_changed');
    if (apiKey || apiSecret) await audit(ownerId, 'sms_credentials_changed');
    revalidatePath('/admin/sms');
    return ok('SMS settings saved.');
  });
}

export async function sendTestSms(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId, user) => {
    const to = blank(fd.get('to')).replace(/[\s-]/g, '');
    if (!validateE164(to)) throw new UserError('Enter the number in E.164 format, e.g. +94771234567');
    requireFreshLogin(user, 'Sending a test SMS');
    const { count: recentTests, error: cntErr } = await adminClient()
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'test')
      .gte('sent_at', new Date(Date.now() - 3_600_000).toISOString());
    if (cntErr) throw new UserError('Could not check the test limit. Try again.');
    if ((recentTests ?? 0) >= 5) throw new UserError('Limit reached: at most 5 test SMS per hour. Try again later.');
    const { data: s } = await adminClient().from('sms_settings').select('template_text').eq('id', 1).single();
    const res = await sendSms({ to, text: s?.template_text ?? 'Test', userId: ownerId, kind: 'test' });
    await audit(ownerId, res.ok ? 'sms_test_sent' : 'sms_test_failed');
    revalidatePath('/admin/sms');
    return res.ok ? ok(`Test SMS accepted by the provider (${res.status}).`) : err(`Test SMS failed (${res.status}).`);
  });
}

// ------------------------------------------------------------------ app limits
const limitsSchema = z.object({
  photo_max_mb: z.coerce.number().int().min(1).max(50),
  video_max_mb: z.coerce.number().int().min(1).max(300),
  max_inflight_uploads: z.coerce.number().int().min(1).max(5),
  temp_cap_mb: z.coerce.number().int().min(64).max(1_000_000),
  snaps_cap_mb: z.coerce.number().int().min(64).max(1_000_000),
  upload_ttl_minutes: z.coerce.number().int().min(5).max(1440),
});

export async function saveLimits(_prev: State, fd: FormData): Promise<State> {
  return owned(async (ownerId) => {
    const raw = Object.fromEntries(Object.keys(limitsSchema.shape).map((k) => [k, fd.get(k)]));
    const parsed = limitsSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const label: Record<string, string> = {
        photo_max_mb: 'Max photo size (1 to 50 MB)',
        video_max_mb: 'Max video size (1 to 300 MB)',
        max_inflight_uploads: 'Concurrent uploads (1 to 5)',
        temp_cap_mb: 'Temp upload cap (at least 64 MB)',
        snaps_cap_mb: 'Snap storage cap (at least 64 MB)',
        upload_ttl_minutes: 'Upload session lifetime (5 to 1440 minutes)',
      };
      throw new UserError(`${label[String(issue.path[0])] ?? 'A value'} is out of range.`);
    }
    const { error } = await adminClient().from('app_settings').update(parsed.data).eq('id', 1);
    if (error) throw new UserError('Could not save limits');
    await audit(ownerId, 'app_limits_changed');
    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    return ok('Limits saved.');
  });
}
