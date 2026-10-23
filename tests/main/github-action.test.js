import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
describe('container publication', () => {
  it('checks runtime and fresh Compose deployment before publishing both architectures', async () => {
    const workflow = await fs.readFile(path.join(root, '.github/workflows/docker-publish.yml'), 'utf8');
    expect(workflow).toContain('needs: test');
    expect(workflow).toContain('scripts/check-container.cjs');
    expect(workflow).toContain('scripts/check-compose.cjs');
    expect(workflow).toContain('linux/amd64,linux/arm64');
    expect(workflow.indexOf('scripts/check-compose.cjs')).toBeLessThan(workflow.indexOf('name: Publish multi-platform image'));
  });
});
