import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWebEntry } from '../../src/renderer/features/web/entry';

const html = readFileSync(`${process.cwd()}/index.html`, 'utf8');
const project = { revision: 4, scope: 'ordinary', items: [{ id: 'ordinary' }] };
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let stop;
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  localStorage.clear(); sessionStorage.clear();
});
afterEach(() => { stop?.(); stop = null; document.body.innerHTML = ''; vi.useRealTimers(); });

function setup(options = {}) {
  const mountWebApp = vi.fn();
  const loadApp = vi.fn(async () => ({ mountWebApp }));
  const fetchImpl = vi.fn(async (url) => response(url === '/api/session'
    ? { authenticated: false }
    : url === '/api/login' ? { authenticated: true, csrfToken: 'current' } : project));
  stop = startWebEntry({ root: document.getElementById('root'), fetchImpl, loadApp, ...options });
  return { fetchImpl, loadApp, mountWebApp };
}
function submit(value = 'correct-password') {
  const input = screen.getByLabelText('访问密码');
  fireEvent.input(input, { target: { value } });
  const event = new Event('submit', { bubbles: true, cancelable: true });
  input.form.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(input).toHaveValue('');
}
function transition(type, persisted) {
  window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('lightweight browser entry', () => {
  it('has a usable, styled password input before any JavaScript or session request', () => {
    const input = screen.getByLabelText('访问密码');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).not.toHaveAttribute('name');
    expect(input.form.method).toBe('post');
    expect(input.form.querySelector('button[type=submit]')).toBeDisabled();
    expect(html).toContain('<style');
    expect([...new DOMParser().parseFromString(html, 'text/html').scripts].every((script) => script.src)).toBe(true);
  });

  it('starts module preload while session is stalled and lets credentials win over late restore', async () => {
    const session = deferred();
    const module = deferred();
    const mountWebApp = vi.fn();
    const fetchImpl = vi.fn(async (url) => url === '/api/session' ? session.promise
      : response(url === '/api/login' ? { authenticated: true, csrfToken: 'current' } : project));
    const loadApp = vi.fn(() => module.promise);
    setup({ fetchImpl, loadApp });
    expect(loadApp).toHaveBeenCalledTimes(1);
    submit();
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url]) => url === '/api/project')).toBe(true));
    expect(mountWebApp).not.toHaveBeenCalled();
    session.resolve(response({ authenticated: true, csrfToken: 'stale' }));
    module.resolve({ mountWebApp });
    await waitFor(() => expect(mountWebApp).toHaveBeenCalledTimes(1));
    const [, bootstrap] = mountWebApp.mock.calls[0];
    expect(bootstrap.project).toBe(project);
    await bootstrap.api.saveProject(project);
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-CSRF-Token']).toBe('current');
    expect(fetchImpl.mock.calls.filter(([url, init]) => url === '/api/project' && init.method === 'GET')).toHaveLength(1);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.documentElement.innerHTML).not.toContain('correct-password');
    expect(document.documentElement.innerHTML).not.toContain('current"');
  });

  it('restores only the ordinary project and hands the same API instance to the app', async () => {
    const fetchImpl = vi.fn(async (url) => response(url === '/api/session'
      ? { authenticated: true, csrfToken: 'restored' } : project));
    const { mountWebApp } = setup({ fetchImpl });
    await waitFor(() => expect(mountWebApp).toHaveBeenCalledTimes(1));
    const [, bootstrap] = mountWebApp.mock.calls[0];
    expect(bootstrap.project).toBe(project);
    await bootstrap.api.saveProject(project);
    expect(fetchImpl.mock.calls.at(-1)[1].headers).toEqual({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'restored' });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/session', '/api/project', '/api/project']);
  });

  it('discards a late project restore after credentials have already started a new bootstrap', async () => {
    const oldProject = deferred();
    let projectReads = 0;
    const fetchImpl = vi.fn(async (url) => url === '/api/project' && ++projectReads === 1 ? oldProject.promise
      : response(url === '/api/session' || url === '/api/login' ? { authenticated: true, csrfToken: 'current' } : project));
    const { mountWebApp } = setup({ fetchImpl });
    await waitFor(() => expect(projectReads).toBe(1));
    submit();
    await waitFor(() => expect(mountWebApp).toHaveBeenCalledTimes(1));
    oldProject.resolve(response({ scope: 'ordinary', items: [{ id: 'stale' }] }));
    await Promise.resolve(); await Promise.resolve();
    expect(mountWebApp).toHaveBeenCalledTimes(1);
    expect(mountWebApp.mock.calls[0][1].project).toBe(project);
  });

  it('shows a normal wrong-password message, clears the password and allows another attempt', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async (url) => response(url === '/api/session' ? { authenticated: false }
      : url === '/api/login' && ++attempts === 1 ? { error: '密码不正确' }
      : url === '/api/login' ? { authenticated: true, csrfToken: 'current' } : project,
    url === '/api/login' && attempts === 1 ? 401 : 200));
    const { mountWebApp } = setup({ fetchImpl });
    submit('wrong');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('密码不正确'));
    expect(fetchImpl.mock.calls.some(([url]) => url === '/api/project')).toBe(false);
    submit();
    await waitFor(() => expect(mountWebApp).toHaveBeenCalledTimes(1));
  });

  it.each(['/api/session', '/api/login', '/api/project'])('bounds stalled %s requests and keeps retry usable', async (stalledPath) => {
    vi.useFakeTimers();
    let stalled = true;
    const fetchImpl = vi.fn(async (url) => stalled && url === stalledPath ? new Promise(() => {})
      : response(url === '/api/session' || url === '/api/login' ? { authenticated: true, csrfToken: 'current' } : project));
    const { mountWebApp } = setup({ fetchImpl, timeoutMs: 50 });
    if (stalledPath === '/api/login') submit();
    await vi.advanceTimersByTimeAsync(60);
    expect(screen.getByRole('alert')).toHaveTextContent('超时');
    const retry = screen.getByRole('button', { name: '重试' });
    expect(retry).toBeEnabled();
    stalled = false;
    fireEvent.click(retry);
    await vi.advanceTimersByTimeAsync(0);
    expect(mountWebApp).toHaveBeenCalledTimes(1);
  });

  it('retries a failed module load without repeating an already successful session/project bootstrap', async () => {
    const mountWebApp = vi.fn();
    const loadApp = vi.fn().mockRejectedValueOnce(new Error('界面加载失败')).mockResolvedValue({ mountWebApp });
    const fetchImpl = vi.fn(async (url) => response(url === '/api/session' ? { authenticated: true, csrfToken: 'current' } : project));
    setup({ fetchImpl, loadApp });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('界面加载失败'));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(mountWebApp).toHaveBeenCalledTimes(1));
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/session', '/api/project']);
    expect(loadApp).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled app download and can retry when that download finishes', async () => {
    vi.useFakeTimers();
    const module = deferred();
    const mountWebApp = vi.fn();
    const fetchImpl = vi.fn(async (url) => response(url === '/api/session' ? { authenticated: true, csrfToken: 'current' } : project));
    setup({ fetchImpl, loadApp: () => module.promise, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    expect(screen.getByRole('alert')).toHaveTextContent('超时');
    module.resolve({ mountWebApp });
    await vi.advanceTimersByTimeAsync(0);
    expect(mountWebApp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(mountWebApp).toHaveBeenCalledTimes(1);
  });

  it('clears the password on pagehide and restores a usable entry only on persisted pageshow', async () => {
    const { fetchImpl, mountWebApp } = setup();
    const input = screen.getByLabelText('访问密码');
    fireEvent.input(input, { target: { value: 'unsent-password' } });
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
    transition('pagehide', true);
    expect(input).toHaveValue('');
    transition('pageshow', false);
    await flush();
    expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/session')).toHaveLength(1);
    transition('pageshow', true);
    await waitFor(() => expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/session')).toHaveLength(2));
    fireEvent.input(input, { target: { value: 'correct-password' } });
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
    submit();
    await waitFor(() => expect(mountWebApp).toHaveBeenCalledTimes(1));
  });

  it.each(['/api/session', '/api/login', '/api/project', 'module'])('ignores pre-hide %s work after restoring from the back/forward cache', async (stage) => {
    const pending = deferred();
    const mountWebApp = vi.fn();
    let sessions = 0;
    let logins = 0;
    let reads = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (url === '/api/session') {
        sessions += 1;
        if (sessions === 1 && stage === '/api/session') return pending.promise;
        return response({ authenticated: sessions === 1 && stage !== '/api/login', csrfToken: 'before-hide' });
      }
      if (url === '/api/login') {
        if (++logins === 1 && stage === '/api/login') return pending.promise;
        return response({ authenticated: true, csrfToken: 'after-show' });
      }
      if (url === '/api/project' && ++reads === 1 && stage === '/api/project') return pending.promise;
      return response(project);
    });
    setup({ fetchImpl, loadApp: () => stage === 'module' ? pending.promise : { mountWebApp } });
    if (stage === '/api/login') submit('pre-hide-password');
    if (stage === '/api/project' || stage === 'module') await waitFor(() => expect(reads).toBe(1));
    transition('pagehide', true);
    transition('pageshow', true);
    await waitFor(() => expect(sessions).toBe(2));
    pending.resolve(stage === 'module' ? { mountWebApp } : response(stage === '/api/project'
      ? { ...project, items: [{ id: 'stale-before-hide' }] }
      : { authenticated: true, csrfToken: 'stale-before-hide' }));
    await flush();
    expect(mountWebApp).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    submit('new-password');
    await waitFor(() => expect(mountWebApp).toHaveBeenCalledTimes(1));
    const [, bootstrap] = mountWebApp.mock.calls[0];
    expect(bootstrap.project).toBe(project);
    await bootstrap.api.saveProject(project);
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-CSRF-Token']).toBe('after-show');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('never resurrects a finally disposed entry on a later persisted pageshow', async () => {
    const pending = deferred();
    const fetchImpl = vi.fn(() => pending.promise);
    const { mountWebApp } = setup({ fetchImpl });
    stop();
    transition('pagehide', true);
    transition('pageshow', true);
    pending.resolve(response({ authenticated: true, csrfToken: 'stale' }));
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mountWebApp).not.toHaveBeenCalled();
  });

  it('ignores an old retry failure after the cached page has started a fresh session check', async () => {
    const pending = deferred();
    const mountWebApp = vi.fn();
    const loadApp = vi.fn().mockRejectedValueOnce(new Error('首次下载失败')).mockImplementation(() => pending.promise);
    let sessions = 0;
    const fetchImpl = vi.fn(async (url) => response(url === '/api/session'
      ? { authenticated: ++sessions === 1, csrfToken: 'before-hide' } : project));
    setup({ fetchImpl, loadApp });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('首次下载失败'));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    transition('pagehide', true);
    transition('pageshow', true);
    await waitFor(() => expect(sessions).toBe(2));
    pending.reject(new Error('旧重试失败'));
    await flush();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mountWebApp).not.toHaveBeenCalled();
  });
});
