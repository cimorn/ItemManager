function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function replaceExtension(fileName, extension) {
  const safeName = toText(fileName) || 'capture';
  return `${safeName.replace(/\.[^.]+$/, '')}.${extension}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = dataUrl;
  });
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片解码失败'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('图片压缩失败'));
      }
    }, type, quality);
  });
}

export async function compressImageFileToWebp(file, options = {}) {
  if (!file) {
    throw new Error('请选择一张图片');
  }

  const maxSize = options.maxSize || 1600;
  const quality = options.quality || 0.78;
  const bitmap = await loadBitmap(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;

  if (!width || !height) {
    throw new Error('无法读取图片尺寸');
  }

  const ratio = Math.min(1, maxSize / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前浏览器不支持图片压缩');
  }

  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close?.();

  const blob = await canvasToBlob(canvas, 'image/webp', quality);

  return {
    dataUrl: await blobToDataUrl(blob),
    mimeType: 'image/webp',
    fileName: replaceExtension(file.name, 'webp'),
    size: blob.size
  };
}

export async function rotateImageDataUrlToWebp(dataUrl, direction = 'right', options = {}) {
  const source = toText(dataUrl);
  if (!source) {
    throw new Error('请先选择一张图片');
  }

  const quality = options.quality || 0.78;
  const image = await dataUrlToImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error('无法读取图片尺寸');
  }

  const canvas = document.createElement('canvas');
  canvas.width = height;
  canvas.height = width;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前浏览器不支持图片旋转');
  }

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(direction === 'left' ? -Math.PI / 2 : Math.PI / 2);
  context.drawImage(image, -width / 2, -height / 2, width, height);

  const blob = await canvasToBlob(canvas, 'image/webp', quality);

  return {
    dataUrl: await blobToDataUrl(blob),
    mimeType: 'image/webp',
    fileName: 'capture.webp',
    size: blob.size
  };
}
