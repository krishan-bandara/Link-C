// Pure helper: many SMS gateways answer HTTP 200 and put the failure in the body.
// Never log or store the body; this only returns a yes/no.

const BAD_STATUS = /^(error|fail|failed|failure|rejected)$/i;
const OK_WORDS = /success|queued|accepted|sent|delivered/i;
const BAD_WORDS = /error|failed|failure|invalid|unauthorized|unauthorised|insufficient|denied|forbidden/i;

function objRejected(o: Record<string, unknown>): boolean {
  for (const k of ['status', 'code', 'status_code']) {
    const v = o[k];
    if (typeof v === 'string' && BAD_STATUS.test(v.trim())) return true;
    if (typeof v === 'number' && v >= 400) return true;
    if (typeof v === 'string' && /^[45]\d\d$/.test(v.trim())) return true;
  }
  if (o.success === false || o.ok === false) return true;
  if (o.error === true || (typeof o.error === 'string' && o.error.length > 0)) return true;
  if (o.error && typeof o.error === 'object') return true;
  if (Array.isArray(o.errors) ? o.errors.length > 0 : o.errors === true || (typeof o.errors === 'string' && o.errors.length > 0)) return true;
  return false;
}

/** True when a 2xx gateway reply looks like a failure. */
export function gatewayRejected(body: string): boolean {
  const text = (body ?? '').trim();
  if (!text) return false;
  let parsed: unknown;
  let isJson = false;
  try {
    parsed = JSON.parse(text);
    isJson = true;
  } catch {
    isJson = false;
  }
  if (isJson && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (objRejected(o)) return true;
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data) && objRejected(o.data as Record<string, unknown>)) return true;
    return false;
  }
  if (OK_WORDS.test(text)) return false;
  return BAD_WORDS.test(text);
}
