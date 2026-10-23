import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WebApp from '../../src/renderer/features/web/WebApp';
import { createWebApi } from '../../src/renderer/features/web/api';
import { useProjectStore } from '../../src/renderer/store/project-store';

const ordinary = {
  revision: 3, scope: 'ordinary', meta: { name: '物品管理' }, paths: { projectDir: 'nas' },
  categories: [{ id: 'office', name: '办公', level: 1, parentId: null }], locations: [{ id: 'home', name: '家', level: 1, parentId: null }],
  items: [{ id: 'normal', name: '普通物品', categoryId: 'office', tags: [], imagePath: '', isPrivate: false }]
};
const full = {
  ...ordinary, scope: 'all',
  categories: [...ordinary.categories, { id: 'look', name: 'Look', level: 1, parentId: null }],
  items: [...ordinary.items, { id: 'hidden', name: '隐藏物品', categoryId: 'look', tags: ['PRIVATE'], imagePath: 'image-hidden', isPrivate: true }]
};

function response(value, status = 200) {
  return { ok: status < 400, status, json: async () => structuredClone(value), blob: async () => new Blob(['image'], { type: 'image/png' }) };
}

function server({ authenticated = false, saveStatus = 200 } = {}) {
  let signedIn = authenticated;
  return vi.fn(async (url, init = {}) => {
    if (url === '/api/session') return response({ authenticated: signedIn, ...(signedIn ? { csrfToken: 'csrf' } : {}) });
    if (url === '/api/login') {
      if (JSON.parse(init.body).password !== 'correct-password') return response({ error: '密码不正确', code: 'INVALID_PASSWORD' }, 401);
      signedIn = true;
      return response({ authenticated: true, csrfToken: 'csrf' });
    }
    if (url === '/api/privacy/open') return response(JSON.parse(init.body || '{}').password === 'separate-password'
      ? { unlocked: true, privacyToken: 'tab-private' } : { unlocked: false });
    if (url === '/api/privacy/close' || url === '/api/logout') return response({ ok: true });
    if (url === '/api/project' && init.method === 'PUT') return saveStatus === 200
      ? response({ ...JSON.parse(init.body), revision: 4 })
      : response({ error: saveStatus === 401 ? '登录已过期，请重新登录' : '其他设备已保存更新，请保留修改并重新读取后重试', code: 'CONFLICT' }, saveStatus);
    if (url === '/api/project') return response(init.headers?.['X-Storage-Privacy'] ? full : ordinary);
    if (url === '/api/images') return response({ imageId: 'uploaded-image' });
    if (url.startsWith('/api/images/')) return response({});
    throw new Error(`Unexpected request: ${url}`);
  });
}

beforeEach(() => {
  useProjectStore.getState().setProject(null);
  URL.createObjectURL = vi.fn(() => 'blob:test-image');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function submitLogoPassword(user, password = 'separate-password') {
  await user.click(screen.getByRole('button', { name: '物品管理', exact: true }));
  const dialog = await screen.findByRole('dialog', { name: '输入密码' });
  if (password) await user.type(within(dialog).getByLabelText('密码'), password);
  await user.click(within(dialog).getByRole('button', { name: '确定', exact: true }));
}

describe('password gated browser inventory', () => {
  it('shows item privacy choices only after successful unlock and hides them again on close or reload', async () => {
    const fetchImpl = server({ authenticated: true });
    const user = userEvent.setup();
    const view = render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    async function checkEditors(unlocked) {
      for (const name of ['新增物品', '普通物品']) {
        await user.click(screen.getByRole('button', { name, exact: true }));
        const dialog = screen.getByRole('dialog');
        if (unlocked) expect(within(dialog).getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
        else expect(dialog).not.toHaveTextContent('隐私');
        expect(within(dialog).getByRole('checkbox', { name: '包装' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: '关闭物品弹窗' }));
      }
    }
    await checkEditors(false);
    await submitLogoPassword(user, 'wrong-password');
    await checkEditors(false);
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    await checkEditors(true);
    await submitLogoPassword(user, 'wrong-password');
    await checkEditors(false);
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    view.unmount();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await checkEditors(false);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it.each(['分类', '位置'])('gates %s create and edit privacy controls on the same unlock state', async mode => {
    const user = userEvent.setup();
    render(<WebApp fetchImpl={server({ authenticated: true })} />);
    await screen.findByRole('button', { name: '普通物品' });
    async function checkCatalog(unlocked) {
      await user.click(screen.getByRole('button', { name: mode, exact: true }));
      if (unlocked) expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeInTheDocument();
      else expect(document.body).not.toHaveTextContent('隐私');
      await user.click(screen.getByRole('button', { name: '新增顶级', exact: true }));
      await user.type(screen.getByLabelText('名称'), mode === '分类' ? 'Look' : '新位置');
      if (unlocked) expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeInTheDocument();
      else expect(document.body).not.toHaveTextContent('隐私');
      await user.click(screen.getByRole('button', { name: '取消', exact: true }));
      await user.click(screen.getByRole('button', { name: '返回', exact: true }));
    }
    await checkCatalog(false);
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    await checkCatalog(true);
    await submitLogoPassword(user, 'wrong-password');
    await checkCatalog(false);
  });

  it('uses the entry bootstrap without another session/project request and retains expiry handling', async () => {
    const fetchImpl = server({ authenticated: true, saveStatus: 401 });
    const api = createWebApi({ fetchImpl });
    await api.session();
    const project = await api.getProject();
    const user = userEvent.setup();
    render(<StrictMode><WebApp bootstrap={{ api, project }} /></StrictMode>);
    await screen.findByRole('button', { name: '普通物品' });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/session', '/api/project']);
    await user.click(screen.getByRole('button', { name: '保存项目' }));
    expect(await screen.findByLabelText('访问密码')).toBeInTheDocument();
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(document.body).not.toHaveTextContent('普通物品');
  });

  it('accepts login while session restore is stalled and ignores the later restored project', async () => {
    let finishSession;
    const normalFetch = server();
    const fetchImpl = vi.fn((url, init) => url === '/api/session'
      ? new Promise((resolve) => { finishSession = () => resolve(response({ authenticated: true, csrfToken: 'stale-csrf' })); })
      : normalFetch(url, init));
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    await user.type(screen.getByLabelText('访问密码'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '登录' }));
    await screen.findByRole('button', { name: '普通物品' });
    await act(async () => finishSession());
    expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/project')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '保存项目' }));
    expect(fetchImpl.mock.calls.find(([url, init]) => url === '/api/project' && init.method === 'PUT')[1].headers['X-CSRF-Token']).toBe('csrf');
  });

  it('does not request any project or display cached data before successful login', async () => {
    useProjectStore.getState().setProject(full);
    const fetchImpl = server();
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '物品管理' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('欢迎回来');
    expect(document.body).not.toHaveTextContent('输入访问密码后查看和管理物品。');
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/session']);
    expect(document.body).not.toHaveTextContent('隐藏物品');
    expect(useProjectStore.getState().currentProject).toBeNull();
    await user.type(screen.getByLabelText('访问密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('密码不正确');
    expect(fetchImpl.mock.calls.some(([url]) => url === '/api/project')).toBe(false);
    await user.type(screen.getByLabelText('访问密码'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('button', { name: '普通物品' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('隐藏物品');
  });

  it('keeps the toolbar quiet and opens all records only after the independent password', async () => {
    const fetchImpl = server({ authenticated: true });
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    expect(document.querySelector('.web-session-bar')).toBeNull();
    expect(document.querySelector('.web-notice-row')).toBeNull();
    expect(document.body).not.toHaveTextContent(/隐私|重新读取|完整备份|导入 JSON|退出登录/);
    await submitLogoPassword(user);
    expect(await screen.findByRole('button', { name: '隐藏物品' })).toBeInTheDocument();
    expect(screen.queryByLabelText('访问密码')).not.toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith('/api/privacy/open', expect.objectContaining({ body: JSON.stringify({ password: 'separate-password' }), headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }) }));
    expect(fetchImpl).toHaveBeenCalledWith('/api/project', expect.objectContaining({ headers: expect.objectContaining({ 'X-Storage-Privacy': 'tab-private' }) }));
    expect(document.body).not.toHaveTextContent(/隐私区已打开|隐私范围|密码正确/);
  });

  it.each(['wrong-password', 'correct-password', ''])('silently leaves ordinary records unchanged for an unsuccessful password attempt %j', async (password) => {
    const fetchImpl = server({ authenticated: true });
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    const before = useProjectStore.getState().currentProject;
    act(() => useProjectStore.getState().setSearch('普通'));
    await submitLogoPassword(user, password);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useProjectStore.getState().currentProject).toBe(before);
    expect(useProjectStore.getState().search).toBe('普通');
    expect(document.body).not.toHaveTextContent(/隐藏物品|隐私|密码不正确|密码错误/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/project')).toHaveLength(1);
  });

  it('purges searches, editor drafts and blob images before each new password prompt', async () => {
    const fetchImpl = server({ authenticated: true });
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '隐藏物品' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('隐私区')).toBeChecked();
    await user.type(within(screen.getByRole('dialog')).getByLabelText('规格'), '秘密草稿');
    act(() => useProjectStore.getState().setSearch('隐藏'));
    await user.click(screen.getByRole('button', { name: '物品管理', exact: true }));
    await screen.findByRole('button', { name: '普通物品' });
    const dialog = await screen.findByRole('dialog', { name: '输入密码' });
    expect(document.body).not.toHaveTextContent('隐藏物品');
    expect(document.body).not.toHaveTextContent('秘密草稿');
    expect(useProjectStore.getState().search).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
    expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/project').at(-1)[1].headers['X-Storage-Privacy']).toBeUndefined();
    await user.type(within(dialog).getByLabelText('密码'), 'wrong-password');
    await user.click(within(dialog).getByRole('button', { name: '确定', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body).not.toHaveTextContent('隐藏物品');
  });

  it('keeps unsaved privacy edits until the user confirms closing', async () => {
    const user = userEvent.setup();
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<WebApp fetchImpl={server({ authenticated: true })} />);
    await screen.findByRole('button', { name: '普通物品' });
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    act(() => useProjectStore.getState().updateItem('hidden', { notes: '需要保留' }));
    await user.click(screen.getByRole('button', { name: '物品管理', exact: true }));
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().currentProject.items.find((item) => item.id === 'hidden').notes).toBe('需要保留');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '物品管理', exact: true }));
    await screen.findByRole('dialog', { name: '输入密码' });
    expect(useProjectStore.getState().currentProject.items).toHaveLength(1);
    confirmation.mockRestore();
  });

  it('purges the revealed project before the server finishes closing access', async () => {
    const user = userEvent.setup();
    const normalFetch = server({ authenticated: true });
    let finishClose;
    const fetchImpl = vi.fn((url, init) => url === '/api/privacy/close'
      ? new Promise((resolve) => { finishClose = () => resolve(response({ ok: true })); })
      : normalFetch(url, init));
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    await user.click(screen.getByRole('button', { name: '物品管理', exact: true }));
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(document.body).not.toHaveTextContent('隐藏物品');
    expect(screen.getByRole('dialog', { name: '输入密码' })).toBeInTheDocument();
    await act(async () => finishClose());
    await screen.findByRole('button', { name: '普通物品' });
    expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/project').at(-1)[1].headers['X-Storage-Privacy']).toBeUndefined();
  });

  it('displays the safe pending cleanup warning returned after saving', async () => {
    const normalFetch = server({ authenticated: true });
    const fetchImpl = vi.fn(async (url, init) => {
      if (url === '/api/project' && init.method === 'PUT') return response({ ...ordinary, revision: 4, storageWarning: { code: 'CLEANUP_PENDING', message: '图片清理正在等待重试' } });
      return normalFetch(url, init);
    });
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await user.click(screen.getByRole('button', { name: '保存项目' }));
    expect(await screen.findByText(/图片清理.*重试/)).toBeInTheDocument();
  });

  it('starts with privacy hidden after refresh even when the session remains authenticated', async () => {
    const fetchImpl = server({ authenticated: true });
    const user = userEvent.setup();
    const first = render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    first.unmount();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    expect(screen.queryByRole('button', { name: '隐藏物品' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '物品管理', exact: true })).toBeInTheDocument();
    expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/project').at(-1)[1].headers['X-Storage-Privacy']).toBeUndefined();
  });

  it('loads authenticated blob previews under React strict mode and revokes them on unmount', async () => {
    const fetchImpl = server({ authenticated: true });
    const user = userEvent.setup();
    const view = render(<StrictMode><WebApp fetchImpl={fetchImpl} /></StrictMode>);
    await screen.findByRole('button', { name: '普通物品' });
    await submitLogoPassword(user);
    await waitFor(() => expect(screen.getByRole('img', { name: '隐藏物品' })).toHaveAttribute('src', 'blob:test-image'));
    view.unmount();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-image'));
  });

  it('clears private data even if closing and loading ordinary records fail', async () => {
    const normalFetch = server({ authenticated: true });
    let projectCalls = 0;
    const fetchImpl = vi.fn(async (url, init) => {
      if (url === '/api/privacy/close') throw new Error('连接失败');
      if (url === '/api/project' && ++projectCalls === 3) throw new Error('普通物品暂时读取失败');
      return normalFetch(url, init);
    });
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    await user.click(screen.getByRole('button', { name: '物品管理', exact: true }));
    await screen.findByRole('alert');
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(document.body).not.toHaveTextContent('隐藏物品');
    expect(document.body).not.toHaveTextContent(/隐私|重新读取/);
  });

  it('uploads a browser photo and retains the explicit private flag through editing and project save', async () => {
    const fetchImpl = server({ authenticated: true });
    const user = userEvent.setup();
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await submitLogoPassword(user);
    await screen.findByRole('button', { name: '隐藏物品' });
    await user.click(await screen.findByRole('button', { name: '普通物品' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('从相册选择图片'), new File(['photo'], 'photo.png', { type: 'image/png' }));
    expect(fetchImpl.mock.calls.some(([url]) => url === '/api/images')).toBe(false);
    await user.click(within(dialog).getByLabelText('隐私区'));
    await user.click(within(dialog).getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useProjectStore.getState().currentProject.items[0]).toMatchObject({ isPrivate: true, imagePath: 'uploaded-image' });
    const saved = fetchImpl.mock.calls.find(([url, init]) => url === '/api/project' && init.method === 'PUT');
    expect(JSON.parse(saved[1].body)).toMatchObject({ revision: 3, scope: 'all', items: expect.arrayContaining([expect.objectContaining({ isPrivate: true, imagePath: 'uploaded-image' })]) });
    expect(saved[1].headers['X-Storage-Privacy']).toBe('tab-private');
    expect(saved[1].headers['X-CSRF-Token']).toBe('csrf');
    expect(fetchImpl.mock.calls.find(([url]) => url === '/api/images')[1].body).toContain('data:image/png;base64,');
  });

  it('keeps an edited item draft open when saving the project fails', async () => {
    const user = userEvent.setup();
    const fetchImpl = server({ authenticated: true, saveStatus: 409 });
    render(<WebApp fetchImpl={fetchImpl} />);
    await user.click(await screen.findByRole('button', { name: '普通物品' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('规格'), '保留弹窗草稿');
    await user.click(within(dialog).getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('其他设备');
    expect(within(screen.getByRole('dialog')).getByLabelText('规格')).toHaveValue('保留弹窗草稿');
    expect(useProjectStore.getState().currentProject.items[0].notes).not.toBe('保留弹窗草稿');
    expect(fetchImpl.mock.calls.filter(([url, init]) => url === '/api/project' && init.method === 'PUT')).toHaveLength(1);
  });

  it('retries a failed new item save without creating duplicate records', async () => {
    const user = userEvent.setup();
    const normalFetch = server({ authenticated: true });
    let saveCalls = 0;
    const fetchImpl = vi.fn(async (url, init) => {
      if (url === '/api/project' && init.method === 'PUT' && ++saveCalls === 1) return response({ error: '连接失败' }, 503);
      return normalFetch(url, init);
    });
    render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    await user.click(screen.getByRole('button', { name: '新增物品' }));
    await user.type(within(screen.getByRole('dialog')).getByLabelText('名称'), '新记录');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('连接失败');
    expect(useProjectStore.getState().currentProject.items).toHaveLength(1);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useProjectStore.getState().currentProject.items.filter((item) => item.name === '新记录')).toHaveLength(1);
    expect(saveCalls).toBe(2);
  });

  it('preserves a draft on a conflicting save', async () => {
    const user = userEvent.setup();
    render(<WebApp fetchImpl={server({ authenticated: true, saveStatus: 409 })} />);
    await screen.findByRole('button', { name: '普通物品' });
    act(() => useProjectStore.getState().updateItem('normal', { notes: '保留修改' }));
    await user.click(screen.getByRole('button', { name: '保存项目' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('其他设备');
    expect(useProjectStore.getState().dirty).toBe(true);
    expect(useProjectStore.getState().currentProject.items[0].notes).toBe('保留修改');
  });

  it.each([200, 503])('blocks app interactions during a toolbar save and releases them after response %i', async (saveStatus) => {
    const user = userEvent.setup();
    const normalFetch = server({ authenticated: true, saveStatus });
    let finishSave;
    const fetchImpl = vi.fn((url, init) => url === '/api/project' && init.method === 'PUT'
      ? new Promise((resolve) => { finishSave = async () => resolve(await normalFetch(url, init)); })
      : normalFetch(url, init));
    const view = render(<WebApp fetchImpl={fetchImpl} />);
    await screen.findByRole('button', { name: '普通物品' });
    const shell = view.container.querySelector('.app-shell');
    expect(shell).not.toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: '保存项目' }));
    // Native inert blocks pointer and keyboard access throughout the entire shell.
    expect(shell).toHaveAttribute('inert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => finishSave());
    await waitFor(() => expect(shell).not.toHaveAttribute('inert'));
    await user.click(screen.getByRole('button', { name: '普通物品' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clears all project data on session expiry', async () => {
    const user = userEvent.setup();
    render(<WebApp fetchImpl={server({ authenticated: true, saveStatus: 401 })} />);
    await screen.findByRole('button', { name: '普通物品' });
    await user.click(screen.getByRole('button', { name: '保存项目' }));
    expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(document.body).not.toHaveTextContent('普通物品');
  });
});
