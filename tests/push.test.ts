import { describe, expect, it } from 'vitest';
import { allowedEndpoint } from '@/lib/push';

describe('push endpoint allow-list', () => {
  it('accepts the real push services', () => {
    expect(allowedEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(allowedEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(allowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });
  it('rejects internal, plain http, odd ports and look-alike hosts', () => {
    expect(allowedEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(allowedEndpoint('https://127.0.0.1/x')).toBe(false);
    expect(allowedEndpoint('https://localhost/x')).toBe(false);
    expect(allowedEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(allowedEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(allowedEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(allowedEndpoint('https://evilfcm.googleapis.com.attacker.io/x')).toBe(false);
    expect(allowedEndpoint('not a url')).toBe(false);
  });
});
