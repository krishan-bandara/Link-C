import { describe, expect, it } from 'vitest';
import { assertPublicHttpsUrl, isPublicIp } from '../src/lib/ssrf';

describe('isPublicIp', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.5.5',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::a00:1',
    'fd00:ec2::254',
    'not-an-ip',
    '999.1.1.1',
  ])('blocks %s', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
  it('does not block neighbours of private ranges', () => {
    expect(isPublicIp('172.32.0.1')).toBe(true);
    expect(isPublicIp('100.128.0.1')).toBe(true);
  });
});

describe('assertPublicHttpsUrl', () => {
  it('accepts https on 443', () => {
    expect(() => assertPublicHttpsUrl('https://api.example.com/send')).not.toThrow();
    expect(() => assertPublicHttpsUrl('https://api.example.com:443/send')).not.toThrow();
  });
  it.each([
    'http://api.example.com',
    'https://api.example.com:8443',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://169.254.169.254/latest',
    'https://user:pw@api.example.com',
    'ftp://example.com',
    'nonsense',
  ])('rejects %s', (u) => {
    expect(() => assertPublicHttpsUrl(u)).toThrow();
  });
});
