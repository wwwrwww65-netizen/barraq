import { describe, it, expect } from 'vitest';
import {
  normalizeUsername,
  buildFirebaseEmail,
} from '../../cloud/username-identity.js';

describe('username identity mapping', () => {
  it('normalizes case and whitespace consistently', () => {
    expect(normalizeUsername('  Cashier 01 ')).toBe('cashier01');
    expect(normalizeUsername('CASHIER01')).toBe('cashier01');
  });

  it('supports Arabic usernames', () => {
    expect(normalizeUsername('  مدير المطعم  ')).toBe('مديرالمطعم');
  });

  it('derives a stable internal email without exposing the username', () => {
    const email = buildFirebaseEmail('tenant-001', 'Manager');
    expect(email).toMatch(/^u[0-9a-f]{64}@accounts\.mistercasher\.invalid$/);
    expect(email).not.toContain('manager');
    expect(buildFirebaseEmail('tenant-001', 'manager')).toBe(email);
  });

  it('isolates identical usernames across tenants', () => {
    expect(buildFirebaseEmail('tenant-001', 'admin'))
      .not.toBe(buildFirebaseEmail('tenant-002', 'admin'));
  });

  it('rejects invalid usernames and missing tenant IDs', () => {
    expect(() => normalizeUsername('ab')).toThrow();
    expect(() => normalizeUsername('name@domain.com')).toThrow();
    expect(() => buildFirebaseEmail('', 'manager')).toThrow();
  });
});
