/**
 * التحقق النحوي لملفات JS في جذر المشروع (node --check) — بدون تنفيذ
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

/** ملفات تستخدم import بدون "type":"module" في package.json */
const SKIP = new Set(['vitest.config.js']);

/** نسخ احتياطية/ملفات ترميز غير متوافق مع node --check */
const SKIP_NAME = (name) =>
  SKIP.has(name) ||
  name.includes('_backup') ||
  name.startsWith('acc_backup');

describe('root JavaScript syntax (node --check)', () => {
  const files = fs
    .readdirSync(root)
    .filter((n) => n.endsWith('.js') && !SKIP_NAME(n));

  it('يوجد ملفات JS في الجذر للفحص', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const name of files) {
    it(`صياغة صحيحة: ${name}`, () => {
      const full = path.join(root, name);
      expect(() => {
        execFileSync(process.execPath, ['--check', full], {
          stdio: 'pipe',
          cwd: root,
          env: process.env,
        });
      }).not.toThrow();
    });
  }
});
