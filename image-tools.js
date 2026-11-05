/**
 * Central image pipeline for Mister Casher.
 * Converts selected images to compact Base64 data URLs before local persistence.
 * The output is intentionally kept well below Firestore's 1 MiB document limit.
 */
(function attachMCImageTools(global) {
  'use strict';

  const DEFAULTS = Object.freeze({
    maxWidth: 1200,
    maxHeight: 1200,
    maxBytes: 420 * 1024,
    maxInputBytes: 25 * 1024 * 1024,
    quality: 0.82,
    minQuality: 0.48,
    qualityStep: 0.08,
    scaleStep: 0.88,
    maxAttempts: 18
  });

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('تعذر فتح الصورة أو أن تنسيقها غير مدعوم.'));
      image.src = src;
    });
  }

  function estimateDataUrlBytes(dataUrl) {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return Infinity;
    const base64 = dataUrl.slice(comma + 1);
    const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  function canvasToCompactDataUrl(canvas, quality) {
    let result = canvas.toDataURL('image/webp', quality);
    if (!result.startsWith('data:image/webp;base64,')) {
      // Older Chromium builds may not support WebP encoding.
      result = canvas.toDataURL('image/jpeg', quality);
    }
    if (!/^data:image\/(webp|jpeg);base64,/.test(result)) {
      throw new Error('تعذر تحويل الصورة إلى صيغة مضغوطة آمنة.');
    }
    return result;
  }

  async function compressImage(file, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    if (!file || typeof file !== 'object') throw new Error('لم يتم اختيار صورة.');
    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      throw new Error('الملف المحدد ليس صورة.');
    }
    if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('ملف الصورة فارغ.');
    if (file.size > opts.maxInputBytes) {
      throw new Error('حجم الصورة الأصلية أكبر من الحد المسموح (25 ميجابايت).');
    }

    const source = await readFileAsDataUrl(file);
    const image = await loadImage(source);
    const originalWidth = Number(image.naturalWidth || image.width);
    const originalHeight = Number(image.naturalHeight || image.height);
    if (!originalWidth || !originalHeight) throw new Error('أبعاد الصورة غير صالحة.');

    const ratio = Math.min(1, opts.maxWidth / originalWidth, opts.maxHeight / originalHeight);
    let width = Math.max(1, Math.round(originalWidth * ratio));
    let height = Math.max(1, Math.round(originalHeight * ratio));
    let quality = opts.quality;
    let result = '';
    let bytes = Infinity;

    for (let attempt = 0; attempt < opts.maxAttempts; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('تعذر تهيئة ضغط الصورة.');
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      result = canvasToCompactDataUrl(canvas, quality);
      bytes = estimateDataUrlBytes(result);
      canvas.width = 1;
      canvas.height = 1;

      if (bytes <= opts.maxBytes) {
        return {
          dataUrl: result,
          width,
          height,
          sizeBytes: bytes,
          originalBytes: file.size,
          mimeType: result.slice(5, result.indexOf(';'))
        };
      }

      if (quality > opts.minQuality) {
        quality = Math.max(opts.minQuality, quality - opts.qualityStep);
      } else {
        width = Math.max(1, Math.floor(width * opts.scaleStep));
        height = Math.max(1, Math.floor(height * opts.scaleStep));
        quality = opts.quality;
      }
    }

    throw new Error('تعذر ضغط الصورة إلى الحجم المناسب للمزامنة. اختر صورة أصغر.');
  }

  global.MCImageTools = Object.freeze({
    compressImage,
    estimateDataUrlBytes
  });
})(window);
