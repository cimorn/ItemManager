import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFile(path.join(root, file), 'utf8');

describe('public deployment documentation', () => {
  it('documents Docker deployment, browser use and updates in both languages', async () => {
    for (const file of ['README.md', 'README.en.md']) {
      const text = await read(file);
      expect(text).toContain('Docker');
      expect(text).toContain('amd64');
      expect(text).toContain('arm64');
      expect(text).toContain('docker compose up -d');
      expect(text).toContain('docker compose pull storage');
      expect(text).toContain('docker compose up -d --no-deps storage');
      expect(text).toContain('STORAGE_ENCRYPTION_KEY');
      expect(text).toContain('.env.example');
      expect(text).not.toMatch(/ItemManager-V|历史参考|legacy|版本迁移|\/volume1\//i);
    }
  });
  it('ships a host-independent Compose entry point', async () => {
    const compose = await read('compose.yaml');
    expect(compose).toContain('storage-mongodb:/data/db');
    expect(compose).toContain('ALI_OSS_BUCKET: ${ALI_OSS_BUCKET:?Set ALI_OSS_BUCKET}');
    expect(compose).not.toMatch(/platform:|container_name:|\/volume1\/|192\.168\.|mcj-file/);
    expect(await read('.env.example')).not.toMatch(/mcj-file|192\.168\.1\.107|storage\.mcj\.life/);
    expect(await read('LICENSE')).toContain('MIT License');
  });
});
