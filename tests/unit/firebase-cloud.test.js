import { describe, it, expect } from 'vitest';
import { validateClaimToken } from '../../cloud/manager-bootstrap.js';
import firebaseConfig from '../../firebase-config.js';
import { initFirebase } from '../../licensing/firebase-licensing.js';

describe('Firebase cloud foundation', () => {
  it('accepts a long URL-safe owner bootstrap token', () => {
    expect(validateClaimToken('A'.repeat(43))).toBe('A'.repeat(43));
  });

  it('rejects short or unsafe bootstrap tokens', () => {
    expect(() => validateClaimToken('short')).toThrow();
    expect(() => validateClaimToken('bad token with spaces'.padEnd(43, 'x'))).toThrow();
  });

  it('uses the configured Firebase project and public web app', () => {
    expect(firebaseConfig.projectId).toBe('mister-23108');
    expect(firebaseConfig.appId).toBe('1:130749360567:web:d1bcaff659899dd5226032');
    expect(firebaseConfig.apiKey).toMatch(/^AIza/);
  });

  it('initializes the client licensing SDK without an Admin service account', () => {
    const result = initFirebase();
    expect(result.ok).toBe(true);
    expect(result.db).toBeTruthy();
  });
});
