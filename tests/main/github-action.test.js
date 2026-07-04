import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.join(__dirname, '..', '..');

describe('GitHub Actions desktop release', () => {
  it('builds and uploads the dated English exe artifact', async () => {
    const workflow = await fs.readFile(
      path.join(projectRoot, '.github', 'workflows', 'desktop-release.yml'),
      'utf8'
    );

    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('branches:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('APP_RELEASE_DATE');
    expect(workflow).toContain("Get-Date -Format 'yy.MM.dd'");
    expect(workflow).toContain('ItemManager-V${{ env.APP_RELEASE_DATE }}.exe');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('softprops/action-gh-release@v2');
    expect(workflow).toContain('node electron/flatten-dist.js');
  });

  it('allows Electron dependency build scripts in CI', async () => {
    const workspaceConfig = await fs.readFile(
      path.join(projectRoot, 'pnpm-workspace.yaml'),
      'utf8'
    );

    expect(workspaceConfig).toContain('electron: true');
    expect(workspaceConfig).toContain('electron-winstaller: true');
  });
});
