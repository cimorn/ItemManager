// @vitest-environment node
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const crc = require('pngjs/lib/crc');
const { transformCardImage } = require('../../server/card-image-transform');
const small = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) });
const body = PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 255) });
function chunk(type, data) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length); bytes.write(type, 4); data.copy(bytes, 8);
  bytes.writeInt32BE(crc.crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4);
  return bytes;
}
function duplicate(interlaced = false) {
  const bytes = Buffer.concat([small.subarray(0, 33), body.subarray(8)]);
  if (interlaced) {
    bytes[53] = 1;
    bytes.writeInt32BE(crc.crc32(bytes.subarray(37, 54)), 54);
  }
  return bytes;
}
afterEach(() => vi.restoreAllMocks());
describe('PNG admission before bounded decoding', () => {
  it('reproduces pngjs accepting a second IHDR that overrides dimensions', () => {
    const decoded = PNG.sync.read(duplicate());
    expect([decoded.width, decoded.height]).toEqual([2, 2]);
  });
  it.each([
    ['duplicate dimensions', () => duplicate()],
    ['duplicate interlace', () => duplicate(true)],
    ['long IHDR', () => Buffer.concat([small.subarray(0, 8), chunk('IHDR', Buffer.concat([small.subarray(16, 29), Buffer.from([0])])), small.subarray(33)])],
    ['short IHDR', () => Buffer.concat([small.subarray(0, 8), chunk('IHDR', small.subarray(16, 28)), small.subarray(33)])],
    ['out-of-bounds chunk length', () => { const bytes = Buffer.from(small); bytes.writeUInt32BE(0xffffffff, 33); return bytes; }],
    ['truncated chunk', () => small.subarray(0, small.length - 1)],
    ['missing IEND', () => small.subarray(0, small.length - 12)],
    ['trailing chunks after IEND', () => Buffer.concat([small, chunk('IEND', Buffer.alloc(0))])],
    ['oversized palette metadata', () => Buffer.concat([small.subarray(0, 33), chunk('PLTE', Buffer.alloc(771)), small.subarray(33)])],
    ['invalid chunk type bytes', () => Buffer.concat([small.subarray(0, 33), chunk('\u00e1BCD', Buffer.alloc(0)), small.subarray(33)])]
  ])('rejects %s without calling the PNG decoder and returns the exact original', (name, create) => {
    const bytes = create(), decode = vi.spyOn(PNG.sync, 'read');
    const result = transformCardImage({ bytes, mime: 'image/png' });
    expect(decode).not.toHaveBeenCalled();
    expect(result.mime).toBe('image/png');
    expect(result.bytes.equals(bytes)).toBe(true);
  });
  it('keeps valid PNGs eligible for the bounded decoder', () => {
    const decode = vi.spyOn(PNG.sync, 'read');
    expect(transformCardImage({ bytes: body, mime: 'image/png' }).bytes.length).toBeLessThanOrEqual(body.length);
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it('accepts valid ancillary metadata and consecutive IDAT chunks', () => {
    const length = body.readUInt32BE(33), compressed = body.subarray(41, 41 + length);
    const bytes = Buffer.concat([
      body.subarray(0, 33), chunk('tEXt', Buffer.from('Author\0Fixture')),
      chunk('IDAT', compressed.subarray(0, 4)), chunk('IDAT', compressed.subarray(4)), body.subarray(45 + length)
    ]);
    const decode = vi.spyOn(PNG.sync, 'read');
    transformCardImage({ bytes, mime: 'image/png' });
    expect(decode).toHaveBeenCalledTimes(1);
    expect([decode.mock.results[0].value.width, decode.mock.results[0].value.height]).toEqual([2, 2]);
  });
});
