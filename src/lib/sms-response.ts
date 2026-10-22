// Pure helper: many SMS gateways answer HTTP 200 and put the failure in the body.
// Never log or store the body; this only returns a yes/no.

const BAD_STATUS = /^(error|fail|failed|failure|rejected)$/i;
const OK_WORDS = /success|queued|accepted|sent|delivered/i;
const BAD_WORDS = /error|failed|failure|invalid|unauthorized|unauthorised|insufficient|denied|forbidden/i;

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
    if (typeof o.status === 'string' && BAD_STATUS.test(o.status.trim())) return true;
    if (o.success === false || o.ok === false) return true;
    if (o.error === true || (typeof o.error === 'string' && o.error.length > 0)) return true;
    return false;
  }
  if (OK_WORDS.test(text)) return false;
  return BAD_WORDS.test(text);
}
