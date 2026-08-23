/**
 * Compress an image File or data-URL for profile avatars / wallpapers.
 * Returns a JPEG data-URL under maxBytes (default ~380KB).
 */
export function compressImageFile(file, { maxSide = 512, maxBytes = 380_000, qualityStart = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file'));
      return;
    }
    if (!String(file.type || '').startsWith('image/')) {
      reject(new Error('Choose an image file'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = qualityStart;
      let data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > maxBytes && quality > 0.35) {
        quality -= 0.1;
        data = canvas.toDataURL('image/jpeg', quality);
      }
      if (data.length > maxBytes) {
        reject(new Error('Image still too large — try a smaller photo'));
        return;
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}
