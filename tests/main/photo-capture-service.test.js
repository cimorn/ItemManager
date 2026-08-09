const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createPhotoCaptureService, getLanAddress } = require('../../src/main/photo-capture/photo-capture-service');

const TEST_WEBP_DATA_URL = 'data:image/webp;base64,UklGRg==';
const services = [];
const tempDirs = [];

async function createTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-photo-capture-'));
  tempDirs.push(dir);
  return dir;
}

async function postPhoto(session) {
  const captureUrl = new URL(session.url);
  const response = await fetch(`${captureUrl.origin}/api/photo-capture/${encodeURIComponent(session.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: TEST_WEBP_DATA_URL })
  });

  expect(response.status).toBe(200);
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('photo capture service', () => {
  it('selects a private physical LAN address', () => {
    expect(
      getLanAddress({
        'Public adapter': [{ family: 'IPv4', internal: false, address: '203.0.113.5' }],
        'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.20.0.1' }],
        'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.1.8' }]
      })
    ).toBe('192.168.1.8');
  });

  it('keeps the phone photo in memory until the item is saved', async () => {
    const projectDir = await createTempDir();
    const service = createPhotoCaptureService({ hostAddress: '127.0.0.1', sessionTtlMs: 60_000 });
    services.push(service);
    const session = await service.createSession();
    const received = new Promise((resolve) => service.once('photo-received', resolve));

    const capturePage = await fetch(session.url);
    expect(capturePage.status).toBe(200);
    await expect(capturePage.text()).resolves.toContain('拍照');

    await postPhoto(session);

    await expect(received).resolves.toMatchObject({
      sessionId: session.id,
      dataUrl: TEST_WEBP_DATA_URL,
      mimeType: 'image/webp'
    });
    await expect(fs.readdir(projectDir)).resolves.toEqual([]);

    const saved = await service.commitSession({
      sessionId: session.id,
      projectDir,
      categoryPath: '办公/文具'
    });

    expect(saved.relativePath).toMatch(/^images\/办公\/文具\/办公-文具-\d{6}-\d{6}\.webp$/);
    await expect(fs.readFile(saved.absolutePath)).resolves.toEqual(Buffer.from('UklGRg==', 'base64'));
  });

  it('discards a cancelled photo without creating a file', async () => {
    const projectDir = await createTempDir();
    const service = createPhotoCaptureService({ hostAddress: '127.0.0.1', sessionTtlMs: 60_000 });
    services.push(service);
    const session = await service.createSession();

    await postPhoto(session);
    await service.discardSession(session.id);

    await expect(
      service.commitSession({ sessionId: session.id, projectDir, categoryPath: '办公/文具' })
    ).rejects.toThrow('拍照会话已失效');
    await expect(fs.readdir(projectDir)).resolves.toEqual([]);
  });
});
