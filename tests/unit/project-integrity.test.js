/**
 * فحص ثابت: صفحات HTML في الجذر تستدعي سكربتات وملفات موجودة
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

const HTML_PAGE = /\.html$/i;

function listRootHtmlFiles() {
  const out = [];
  for (const name of fs.readdirSync(root)) {
    if (!HTML_PAGE.test(name)) continue;
    out.push(path.join(root, name));
  }
  return out;
}

describe('project HTML integrity', () => {
  const htmlFiles = listRootHtmlFiles();

  it('يوجد ملفات HTML في الجذر', () => {
    expect(htmlFiles.length).toBeGreaterThan(5);
  });

  for (const htmlPath of htmlFiles) {
    const base = path.basename(htmlPath);
    it(`المراجع النسبية في ${base} تشير لملفات موجودة`, () => {
      const dir = path.dirname(htmlPath);
      let html = fs.readFileSync(htmlPath, 'utf8');
      // إزالة التعليقات لتقليل إيجابيات خاطئة
      html = html.replace(/<!--[\s\S]*?-->/g, '');
      const re = /(?:href|src)=["']([^"']+)["']/g;
      let m;
      const seen = new Set();
      while ((m = re.exec(html)) !== null) {
        let ref = m[1].trim();
        if (!ref || ref.startsWith('http') || ref.startsWith('//') || ref.startsWith('data:')) continue;
        if (ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('tel:')) continue;
        // روابط داخل الصفحة #section
        const hash = ref.indexOf('#');
        if (hash !== -1) ref = ref.slice(0, hash);
        if (!ref) continue;
        // استعلامات
        const q = ref.indexOf('?');
        if (q !== -1) ref = ref.slice(0, q);
        const target = path.normalize(path.join(dir, ref));
        if (seen.has(target)) continue;
        seen.add(target);
        expect(
          fs.existsSync(target),
          `مفقود: ${ref} (من ${base})`,
        ).toBe(true);
      }
    });
  }
});
