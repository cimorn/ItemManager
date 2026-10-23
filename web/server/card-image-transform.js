'use strict';
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const MAX_PIXELS = 8 * 1000 * 1000;
const MAX_INPUT = 20 * 1024 * 1024;

function hasBoundedPngStructure(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false;
  let offset = 8, chunks = 0, colorType, paletteEntries = 0;
  let header = false, data = false, dataEnded = false, transparency = false, gamma = false;
  while (offset < bytes.length && ++chunks <= 4096) {
    if (bytes.length - offset < 12) return false;
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (length > 0x7fffffff || !Number.isSafeInteger(end) || end > bytes.length) return false;
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type) || (!header && type !== 'IHDR')) return false;
    if (type === 'IHDR') {
      // pngjs accepts repeated IHDR chunks and replaces its decode metadata.
      // Validate the entire chunk stream before allowing any pixel allocation.
      if (header || offset !== 8 || length !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
      const pixels = width * height, depth = bytes[offset + 16];
      colorType = bytes[offset + 17];
      const validDepth = [0, 3].includes(colorType) ? [1, 2, 4, 8].includes(depth) : [2, 4, 6].includes(colorType) && depth === 8;
      // Interlaced pngjs sync decoding uses an unbounded inflate path.
      if (!width || !height || !Number.isSafeInteger(pixels) || pixels > MAX_PIXELS || !validDepth || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) return false;
      header = true;
    } else if (type === 'PLTE') {
      if (paletteEntries || data || transparency || [0, 4].includes(colorType) || !length || length > 768 || length % 3) return false;
      paletteEntries = length / 3;
    } else if (type === 'tRNS') {
      if (transparency || data || (colorType === 0 ? length !== 2 : colorType === 2 ? length !== 6 : colorType === 3 ? !paletteEntries || !length || length > paletteEntries : true)) return false;
      transparency = true;
    } else if (type === 'gAMA') {
      if (gamma || paletteEntries || data || length !== 4) return false;
      gamma = true;
    } else if (type === 'IDAT') {
      if (dataEnded || (colorType === 3 && !paletteEntries)) return false;
      data = true;
    } else if (type === 'IEND') {
      return data && length === 0 && end === bytes.length;
    } else if (type[0] === type[0].toUpperCase()) return false;
    if (data && type !== 'IDAT') dataEnded = true;
    offset = end;
  }
  return false;
}

// Read only the bounded TIFF orientation field. The output deliberately omits
// source metadata, so browsers cannot apply the rotation a second time.
function exifOrientation(bytes) {
  try {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 218 || marker === 217) break;
      const size = bytes.readUInt16BE(offset + 2);
      if (size < 2 || offset + size + 2 > bytes.length) break;
      if (marker === 225 && bytes.subarray(offset + 4, offset + 10).toString('binary') === 'Exif\0\0') {
        const tiff = bytes.subarray(offset + 10, offset + size + 2);
        const little = tiff.subarray(0, 2).toString() === 'II';
        if (!little && tiff.subarray(0, 2).toString() !== 'MM') return 1;
        const u16 = index => little ? tiff.readUInt16LE(index) : tiff.readUInt16BE(index);
        const u32 = index => little ? tiff.readUInt32LE(index) : tiff.readUInt32BE(index);
        if (u16(2) !== 42) return 1;
        const directory = u32(4), count = Math.min(u16(directory), 256);
        for (let n = 0; n < count; n++) {
          const entry = directory + 2 + n * 12;
          if (u16(entry) === 0x112 && u16(entry + 2) === 3 && u32(entry + 4) === 1) {
            const orientation = u16(entry + 8); return orientation >= 1 && orientation <= 8 ? orientation : 1;
          }
        }
        return 1;
      }
      offset += size + 2;
    }
  } catch { /* Incomplete metadata is ignored; decoding still validates pixels. */ }
  return 1;
}
function transformCardImage(input) {
  const bytes = Buffer.from(input.bytes), mime = input.mime;
  const fallback = { bytes, mime };
  if (!bytes.length || bytes.length > MAX_INPUT) return fallback;
  try {
    let decoded, orientation = 1;
    if (mime === 'image/jpeg') {
      decoded = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: MAX_PIXELS / 1e6, maxMemoryUsageInMB: 96, tolerantDecoding: false });
      orientation = exifOrientation(bytes);
    } else if (mime === 'image/png') {
      if (!hasBoundedPngStructure(bytes)) return fallback;
      decoded = PNG.sync.read(bytes, { checkCRC: true });
    } else return fallback;
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_PIXELS) return fallback;
    const swapped = orientation >= 5;
    const sourceWidth = decoded.width, sourceHeight = decoded.height;
    const orientedWidth = swapped ? sourceHeight : sourceWidth, orientedHeight = swapped ? sourceWidth : sourceHeight;
    const scale = Math.min(1, 384 / Math.max(orientedWidth, orientedHeight));
    const width = Math.max(1, Math.round(orientedWidth * scale)), height = Math.max(1, Math.round(orientedHeight * scale));
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const ox = Math.min(orientedWidth - 1, Math.floor((x + 0.5) * orientedWidth / width));
      const oy = Math.min(orientedHeight - 1, Math.floor((y + 0.5) * orientedHeight / height));
      let sx = ox, sy = oy;
      switch (orientation) {
        case 2: sx = sourceWidth - 1 - ox; break;
        case 3: sx = sourceWidth - 1 - ox; sy = sourceHeight - 1 - oy; break;
        case 4: sy = sourceHeight - 1 - oy; break;
        case 5: sx = oy; sy = ox; break;
        case 6: sx = oy; sy = sourceHeight - 1 - ox; break;
        case 7: sx = sourceWidth - 1 - oy; sy = sourceHeight - 1 - ox; break;
        case 8: sx = sourceWidth - 1 - oy; sy = ox; break;
      }
      const source = (sy * sourceWidth + sx) * 4, target = (y * width + x) * 4, alpha = decoded.data[source + 3] / 255;
      for (let c = 0; c < 3; c++) data[target + c] = Math.round(decoded.data[source + c] * alpha + 255 * (1 - alpha));
      data[target + 3] = 255;
    }
    const result = jpeg.encode({ width, height, data }, 65).data;
    return result.length < bytes.length ? { bytes: result, mime: 'image/jpeg' } : fallback;
  } catch { return fallback; }
}
module.exports = { transformCardImage, MAX_PIXELS };
