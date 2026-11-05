import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'image-tools.js'), 'utf8');

function loadTools() {
  class FakeFileReader {
    readAsDataURL() {
      this.result = 'data:image/png;base64,AAAA';
      queueMicrotask(() => this.onload && this.onload());
    }
  }

  class FakeImage {
    constructor() {
      this.naturalWidth = 2400;
      this.naturalHeight = 1600;
    }
    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onload && this.onload());
    }
  }

  const document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error('unexpected element');
      return {
        width: 0,
        height: 0,
        getContext() {
          return { clearRect() {}, drawImage() {} };
        },
        toDataURL(mime, quality) {
          const rawBytes = Math.max(64, Math.ceil(this.width * this.height * quality * 0.22));
          const base64Length = Math.ceil(rawBytes / 3) * 4;
          return `data:${mime};base64,${'A'.repeat(base64Length)}`;
        }
      };
    }
  };

  const window = {};
  vm.runInNewContext(source, {
    window, document, FileReader: FakeFileReader, Image: FakeImage,
    Promise, Object, String, Number, Math, RegExp, Infinity
  });
  return window.MCImageTools;
}

describe('MCImageTools', () => {
  it('compresses and returns a Base64 data URL within the configured byte budget', async () => {
    const tools = loadTools();
    const result = await tools.compressImage(
      { type: 'image/png', size: 2 * 1024 * 1024 },
      { maxWidth: 1000, maxHeight: 1000, maxBytes: 120 * 1024 }
    );
    expect(result.dataUrl.startsWith('data:image/webp;base64,')).toBe(true);
    expect(result.width).toBeLessThanOrEqual(1000);
    expect(result.height).toBeLessThanOrEqual(1000);
    expect(result.sizeBytes).toBeLessThanOrEqual(120 * 1024);
    expect(result.originalBytes).toBe(2 * 1024 * 1024);
  });

  it('rejects non-image files', async () => {
    const tools = loadTools();
    await expect(tools.compressImage({ type: 'application/pdf', size: 1024 })).rejects.toThrow('ليس صورة');
  });

  it('rejects oversized source files before decoding', async () => {
    const tools = loadTools();
    await expect(tools.compressImage({ type: 'image/jpeg', size: 26 * 1024 * 1024 })).rejects.toThrow('25 ميجابايت');
  });
});
