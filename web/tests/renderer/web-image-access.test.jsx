import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageAccessProvider, useImageAccess, useImagePreview } from '../../src/renderer/features/web/ImageAccessContext';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import { createWebApi } from '../../src/renderer/features/web/api';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

describe('new browser image previews', () => {
  it('does not resurrect a purged retained entry when its consumer releases after disposal', async () => {
    const api = { readImage: vi.fn(async () => new Blob(['photo'])) };
    URL.createObjectURL = vi.fn(() => 'blob:purged'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api}>{children}</ImageAccessProvider> });
    const access = view.result.current, preview = access.acquire('one');
    await preview.promise; access.dispose(); preview.release(); access.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it('adds the card query only when requested and preserves ordinary API image reads', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['photo']) }));
    const api = createWebApi({ fetchImpl });
    await api.readImage('image/one'); await api.readImage('image/one', { variant: 'card' });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/images/image%2Fone', '/api/images/image%2Fone?variant=card']);
  });
  it('bounds each attempt even if fetch ignores abort, retries once, then frees the queue', async () => {
    vi.useFakeTimers();
    const api = { readImage: vi.fn((id) => id === 'stalled' ? new Promise(() => {}) : Promise.resolve(new Blob(['photo']))) };
    URL.createObjectURL = vi.fn(() => 'blob:next'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxConcurrent={1} attemptTimeoutMs={100}>{children}</ImageAccessProvider> });
    const access = view.result.current;
    const stalled = access.load('stalled').catch(error => error), next = access.load('next');
    await act(async () => vi.advanceTimersByTimeAsync(201));
    expect(await stalled).toMatchObject({ code: 'IMAGE_TIMEOUT' });
    expect(await next).toBe('blob:next');
    expect(api.readImage.mock.calls.map(([id]) => id)).toEqual(['stalled', 'stalled', 'next']);
    expect(api.readImage.mock.calls[0][1]).toMatchObject({ variant: 'card' });
    expect(api.readImage.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels unused pending work without retry and lets the next queued preview start', async () => {
    const api = { readImage: vi.fn(id => id === 'gone' ? new Promise(() => {}) : Promise.resolve(new Blob(['photo']))) };
    URL.createObjectURL = vi.fn(() => 'blob:next'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxConcurrent={1}>{children}</ImageAccessProvider> });
    const pending = view.result.current.acquire('gone'), queued = view.result.current.acquire('next');
    pending.release();
    expect(await pending.promise).toBe(''); expect(await queued.promise).toBe('blob:next');
    expect(api.readImage.mock.calls.map(([id]) => id)).toEqual(['gone','next']);
  });
  it('leaves an active preview untouched through repeated staged uploads', async () => {
    let sequence = 0;
    const api = { uploadImage: vi.fn(async () => ({ imageId: `staged-${++sequence}` })), readImage: vi.fn(async () => new Blob(['1234'])) };
    URL.createObjectURL = vi.fn(() => 'blob:normal-read'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => ({ access: useImageAccess(), url: useImagePreview('waiting') }), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxBytes={4}>{children}</ImageAccessProvider> });
    await waitFor(() => expect(view.result.current.url).toBe('blob:normal-read'));
    // A visible original consumes the budget. Staging new photos must not take
    // ownership of preview space or interfere with the editor's returned IDs.
    for (let index = 1; index <= 3; index++) {
      await expect(view.result.current.access.upload(new File(['1234'], `${index}.png`, { type: 'image/png' }))).resolves.toEqual({ imageId: `staged-${index}` });
    }
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(api.readImage).toHaveBeenCalledTimes(1);
  });

  it('does not leave an unbound upload pin that blocks a later normal preview', async () => {
    const api = { uploadImage: vi.fn(async () => ({ imageId: 'unbound' })), readImage: vi.fn(async () => new Blob(['1234'])) };
    URL.createObjectURL = vi.fn(() => 'blob:normal'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxBytes={4}>{children}</ImageAccessProvider> });
    await view.result.current.upload(new File(['1234'], 'photo.png', { type: 'image/png' }));
    const normal = view.result.current.acquire('normal-bound-image');
    await expect(normal.promise).resolves.toBe('blob:normal');
    normal.release();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    view.unmount(); await act(async () => {});
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:normal');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('eventually loads all 60 still-near fallback cards after the bounded request queue drains', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300, left: 0, right: 200 });
    const gate = deferred(); let active = 0; let peak = 0;
    const api = { readImage: vi.fn(async () => { active++; peak = Math.max(peak, active); await gate.promise; active--; return new Blob(['photo']); }) };
    URL.createObjectURL = vi.fn(() => 'blob:near-capacity'); URL.revokeObjectURL = vi.fn();
    render(<ImageAccessProvider api={api}>{Array.from({ length: 60 }, (_, index) => <ItemGalleryCard key={index} item={{ title: `附近照片${index}`, imagePath: `near-${index}` }} />)}</ImageAccessProvider>);
    expect(api.readImage).toHaveBeenCalledTimes(4);
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(60));
    expect(api.readImage).toHaveBeenCalledTimes(60);
    expect(peak).toBe(4);
  });

  it('retries a still-near preview when another active card releases its byte budget', async () => {
    const observers = [];
    vi.stubGlobal('IntersectionObserver', class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} });
    const api = { readImage: vi.fn(async (id) => { if (id === 'missing') throw Object.assign(new Error('missing'), { status: 404 }); return new Blob(['1234']); }) };
    let sequence = 0;
    URL.createObjectURL = vi.fn(() => `blob:budget-${++sequence}`); URL.revokeObjectURL = vi.fn();
    render(<ImageAccessProvider api={api} maxBytes={4}><ItemGalleryCard item={{ title: '占用空间', imagePath: 'one' }} /><ItemGalleryCard item={{ title: '等待空间', imagePath: 'two' }} /><ItemGalleryCard item={{ title: '不存在', imagePath: 'missing' }} /></ImageAccessProvider>);
    await act(async () => observers[0].callback([{ isIntersecting: true }]));
    expect(screen.getByRole('img', { name: '占用空间' })).toHaveAttribute('src', 'blob:budget-1');
    await act(async () => observers[1].callback([{ isIntersecting: true }]));
    expect(screen.queryByRole('img', { name: '等待空间' })).not.toBeInTheDocument();
    expect(api.readImage).toHaveBeenCalledTimes(2);
    await act(async () => observers[2].callback([{ isIntersecting: true }]));
    expect(api.readImage).toHaveBeenCalledTimes(3);
    expect(api.readImage.mock.calls.filter(([id]) => id === 'two')).toHaveLength(1);
    await act(async () => observers[0].callback([{ isIntersecting: false }]));
    await waitFor(() => expect(screen.getByRole('img', { name: '等待空间' })).toHaveAttribute('src', 'blob:budget-2'));
    expect(api.readImage).toHaveBeenCalledTimes(4);
    expect(api.readImage.mock.calls.filter(([id]) => id === 'two')).toHaveLength(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:budget-1');
  });

  it('does not repeatedly download an image that can never fit the configured preview budget', async () => {
    const api = { readImage: vi.fn(async (id) => new Blob([id === 'too-large' ? '12345678' : '1234'])) };
    URL.createObjectURL = vi.fn(() => 'blob:small'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => ({ access: useImageAccess(), url: useImagePreview('too-large') }), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxBytes={4}>{children}</ImageAccessProvider> });
    await act(async () => { const small = view.result.current.access.acquire('small'); await small.promise; small.release(); });
    expect(api.readImage.mock.calls.filter(([id]) => id === 'too-large')).toHaveLength(1);
    expect(view.result.current.url).toBe('');
  });

  it.each(['offscreen', 'dispose'])('cancels a capacity-blocked preview on %s before another request completes', async (change) => {
    const observers = [];
    vi.stubGlobal('IntersectionObserver', class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} });
    const gate = deferred();
    const api = { readImage: vi.fn(async () => { await gate.promise; return new Blob(['photo']); }) };
    URL.createObjectURL = vi.fn(() => 'blob:cancel-capacity'); URL.revokeObjectURL = vi.fn();
    let access;
    function CaptureAccess() { access = useImageAccess(); return null; }
    render(<ImageAccessProvider api={api} maxConcurrent={1} maxQueued={0}><CaptureAccess /><ItemGalleryCard item={{ title: '正在读取', imagePath: 'active' }} /><ItemGalleryCard item={{ title: '取消等待', imagePath: 'waiting' }} /></ImageAccessProvider>);
    await act(async () => { for (const observer of observers) observer.callback([{ isIntersecting: true }]); });
    expect(api.readImage).toHaveBeenCalledTimes(1);
    await act(async () => { if (change === 'offscreen') observers[1].callback([{ isIntersecting: false }]); else access.dispose(); });
    await act(async () => gate.resolve());
    expect(api.readImage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('img', { name: '取消等待' })).not.toBeInTheDocument();
    if (change === 'dispose') expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 422])('does not retry a failed preview with status %i on unrelated capacity changes', async (status) => {
    const api = { readImage: vi.fn(async (id) => { if (id === 'denied') throw Object.assign(new Error('permanent failure'), { status }); return new Blob(['photo']); }) };
    URL.createObjectURL = vi.fn(() => 'blob:unrelated'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => ({ access: useImageAccess(), url: useImagePreview('denied') }), { wrapper: ({ children }) => <ImageAccessProvider api={api}>{children}</ImageAccessProvider> });
    await waitFor(() => expect(api.readImage).toHaveBeenCalledTimes(1));
    await act(async () => { const unrelated = view.result.current.access.acquire('unrelated'); await unrelated.promise; unrelated.release(); });
    expect(api.readImage.mock.calls.filter(([id]) => id === 'denied')).toHaveLength(1);
    expect(view.result.current.url).toBe('');
  });

  it('reuses a completed offscreen preview without another download and purges it on unmount', async () => {
    let observe;
    vi.stubGlobal('IntersectionObserver', class { constructor(callback) { observe = callback; } observe() {} disconnect() {} });
    const api = { readImage: vi.fn().mockResolvedValue(new Blob(['one'])) };
    URL.createObjectURL = vi.fn().mockReturnValue('blob:old'); URL.revokeObjectURL = vi.fn();
    const view = render(<ImageAccessProvider api={api}><ItemGalleryCard item={{ title: '滚动照片', imagePath: 'photo' }} /></ImageAccessProvider>);
    await act(async () => observe([{ isIntersecting: true }]));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:old');
    await act(async () => observe([{ isIntersecting: false }]));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => observe([{ isIntersecting: true }]));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:old');
    expect(api.readImage).toHaveBeenCalledTimes(1);
    view.unmount(); await act(async () => {});
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old');
  });

  it('retries a transient read once and leaves permission or missing-image failures alone', async () => {
    let attempts = 0;
    const api = { readImage: vi.fn(async () => { if (++attempts === 1) throw new Error('network interrupted'); return new Blob(['original']); }) };
    URL.createObjectURL = vi.fn(() => 'blob:retry'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api}>{children}</ImageAccessProvider> });
    expect(await view.result.current.load('retry')).toBe('blob:retry');
    expect(attempts).toBe(2);
    for (const status of [401, 403, 404]) {
      api.readImage.mockRejectedValueOnce(Object.assign(new Error('denied'), { status }));
      const before = api.readImage.mock.calls.length;
      await expect(view.result.current.load(`denied-${status}`)).rejects.toMatchObject({ status });
      expect(api.readImage.mock.calls.length - before).toBe(1);
    }
  });

  it('keeps a visible shared preview until its last consumer leaves and releases it on unmount', async () => {
    const api = { readImage: vi.fn(async () => new Blob(['photo'])) };
    URL.createObjectURL = vi.fn(() => 'blob:shared'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxEntries={1}>{children}</ImageAccessProvider> });
    const first = view.result.current.acquire('shared'); const second = view.result.current.acquire('shared');
    await Promise.all([first.promise, second.promise]);
    await expect(view.result.current.load('other')).rejects.toThrow();
    first.release(); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    second.release(); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(await view.result.current.load('other')).toBe('blob:shared');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:shared');
  });

  it('returns a staged upload ID without consuming a tiny preview budget', async () => {
    const api = { uploadImage: vi.fn(async () => ({ imageId: 'staged-large' })), readImage: vi.fn() };
    URL.createObjectURL = vi.fn(); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxBytes={1}>{children}</ImageAccessProvider> });
    await expect(view.result.current.upload(new File(['photo'], 'photo.png', { type: 'image/png' }))).resolves.toEqual({ imageId: 'staged-large' });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('bounds unused blob bytes and entries and revokes evicted URLs', async () => {
    const api = { readImage: vi.fn(async () => new Blob(['1234'])) };
    let sequence = 0;
    URL.createObjectURL = vi.fn(() => `blob:cached-${++sequence}`); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxEntries={2} maxBytes={8}>{children}</ImageAccessProvider> });
    const access = view.result.current;
    expect(await access.load('one')).toBe('blob:cached-1');
    await access.load('two'); await access.load('one'); await access.load('three');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cached-2');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:cached-1');
    await access.load('two'); expect(api.readImage).toHaveBeenCalledTimes(4);
  });

  it('deduplicates image reads, limits parallel requests, and bounds queued work', async () => {
    const pending = [];
    const api = { readImage: vi.fn(() => { const gate = deferred(); pending.push(gate); return gate.promise; }) };
    URL.createObjectURL = vi.fn(() => 'blob:bounded'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxConcurrent={2} maxQueued={1}>{children}</ImageAccessProvider> });
    const access = view.result.current;
    const first = access.load('one'); const duplicate = access.load('one'); const second = access.load('two'); const third = access.load('three');
    const excess = access.load('four').catch((error) => error);
    expect(api.readImage).toHaveBeenCalledTimes(2);
    expect(await excess).toBeInstanceOf(Error);
    await act(async () => { pending[0].resolve(new Blob(['first'])); });
    expect(api.readImage).toHaveBeenCalledTimes(3);
    await act(async () => { pending[1].resolve(new Blob(['second'])); pending[2].resolve(new Blob(['third'])); });
    expect(await Promise.all([first, duplicate, second, third])).toEqual(Array(4).fill('blob:bounded'));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });

  it('aborts active requests, invalidates queued reads and ignores late bytes on disposal', async () => {
    const pending = deferred();
    const api = { readImage: vi.fn(() => pending.promise) };
    URL.createObjectURL = vi.fn(() => 'blob:obsolete'); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api} maxConcurrent={1}>{children}</ImageAccessProvider> });
    const access = view.result.current;
    const first = access.load('private'); const queued = access.load('queued-private');
    access.dispose();
    const signal = api.readImage.mock.calls[0][1]?.signal;
    await act(async () => pending.resolve(new Blob(['private bytes'])));
    expect(signal?.aborted).toBe(true);
    expect(await Promise.all([first, queued])).toEqual(['', '']);
    expect(api.readImage).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it.each(['closePrivacy', 'logout', 'clearSession', 'clearPrivacy'])('revokes access URLs synchronously when the API calls %s', async (action) => {
    const api = createWebApi({ fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({}), blob: async () => new Blob(['private']) })) });
    let sequence = 0;
    URL.createObjectURL = vi.fn(() => `blob:scoped-${++sequence}`); URL.revokeObjectURL = vi.fn();
    const view = renderHook(() => useImageAccess(), { wrapper: ({ children }) => <ImageAccessProvider api={api}>{children}</ImageAccessProvider> });
    const oldAccess = view.result.current;
    await oldAccess.load('private');
    const unused = oldAccess.acquire('retained'); await unused.promise; unused.release();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => {
      const result = api[action]();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scoped-1');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scoped-2');
      await result;
    });
    expect(await oldAccess.load('private')).toBe('');
    expect(view.result.current).not.toBe(oldAccess);
    // The same image identifier in the new ordinary/private scope must fetch
    // fresh bytes instead of sharing the previous capability's retained URL.
    expect(await view.result.current.load('private')).toBe('blob:scoped-3');
  });

  it('distinguishes absent, loading and failed card images without nesting buttons', async () => {
    let observe;
    vi.stubGlobal('IntersectionObserver', class { constructor(callback) { observe = callback; } observe() {} disconnect() {} });
    let reject;
    const api = { readImage: vi.fn(() => new Promise((resolve, fail) => { reject = fail; })) };
    const view = render(<ImageAccessProvider api={api}><ItemGalleryCard item={{ title: '有照片', imagePath: 'photo' }} /><ItemGalleryCard item={{ title: '无照片' }} /></ImageAccessProvider>);
    expect(screen.getByText('无图')).toBeInTheDocument();
    expect(screen.getByText('图片加载中…')).toBeInTheDocument();
    await act(async () => observe([{ isIntersecting: true }]));
    await act(async () => reject(Object.assign(new Error('missing'), { status: 404 })));
    expect(screen.getByText('图片加载失败')).toBeInTheDocument();
    expect(view.container.querySelector('button button')).toBeNull();
  });

  it('requests gallery photos only when their card is near the viewport and deduplicates shared IDs', async () => {
    const observers = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.observe = vi.fn(); this.disconnect = vi.fn(); observers.push(this); }
    });
    const api = { readImage: vi.fn(async () => new Blob(['photo'])) };
    URL.createObjectURL = vi.fn(() => 'blob:near'); URL.revokeObjectURL = vi.fn();
    const view = render(<ImageAccessProvider api={api}><ItemGalleryCard item={{ title: '照片一', imagePath: 'same' }} /><ItemGalleryCard item={{ title: '照片二', imagePath: 'same' }} /></ImageAccessProvider>);
    expect(api.readImage).not.toHaveBeenCalled();
    expect(observers).toHaveLength(2);
    expect(observers[0].options.rootMargin).toBe('240px 0px');
    await act(async () => { for (const observer of observers) observer.callback([{ isIntersecting: true }]); });
    expect(api.readImage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: '照片一' })).toHaveAttribute('src', 'blob:near');
    expect(screen.getByRole('img', { name: '照片二' })).toHaveAttribute('src', 'blob:near');
    await act(async () => observers[0].callback([{ isIntersecting: false }]));
    expect(screen.queryByRole('img', { name: '照片一' })).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => observers[1].callback([{ isIntersecting: false }]));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    view.unmount(); await act(async () => {});
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:near');
    expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it('falls back to viewport geometry and scroll events when IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const rectangle = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 2000, bottom: 2200, left: 0, right: 200 });
    const api = { readImage: vi.fn(async () => new Blob(['photo'])) };
    URL.createObjectURL = vi.fn(() => 'blob:fallback'); URL.revokeObjectURL = vi.fn();
    render(<ImageAccessProvider api={api}><ItemGalleryCard item={{ title: '旧浏览器', imagePath: 'photo' }} /></ImageAccessProvider>);
    expect(api.readImage).not.toHaveBeenCalled();
    rectangle.mockReturnValue({ top: 100, bottom: 300, left: 0, right: 200 });
    fireEvent.scroll(window);
    await waitFor(() => expect(screen.getByRole('img', { name: '旧浏览器' })).toHaveAttribute('src', 'blob:fallback'));
    expect(api.readImage).toHaveBeenCalledTimes(1);
  });

  it('loads later photos in a fallback inventory larger than the queue and cleans nested-scroll listeners', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    let offset = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const index = Number((this.getAttribute('aria-label') || '').replace('旧浏览器照片', ''));
      return { top: index * 400 - offset, bottom: index * 400 - offset + 200, left: 0, right: 200 };
    });
    const remove = vi.spyOn(window, 'removeEventListener');
    const api = { readImage: vi.fn(async () => new Blob(['photo'])) };
    URL.createObjectURL = vi.fn(() => 'blob:later'); URL.revokeObjectURL = vi.fn();
    const view = render(<ImageAccessProvider api={api}><div data-testid="scroll-gallery">{Array.from({ length: 60 }, (_, index) => <ItemGalleryCard key={index} item={{ title: `旧浏览器照片${index}`, imagePath: `photo-${index}` }} />)}</div></ImageAccessProvider>);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    expect(api.readImage).toHaveBeenCalledTimes(3);
    offset = 59 * 400;
    fireEvent.scroll(screen.getByTestId('scroll-gallery'), { bubbles: false });
    await waitFor(() => expect(screen.getByRole('img', { name: '旧浏览器照片59' })).toHaveAttribute('src', 'blob:later'));
    expect(api.readImage).toHaveBeenCalledTimes(5);
    view.unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('returns an unbound upload ID without reading or retaining the local photo as a preview URL', async () => {
    const api = {
      uploadImage: vi.fn(async () => ({ imageId: 'new-unbound-image' })),
      readImage: vi.fn(async () => { throw Object.assign(new Error('图片尚未绑定'), { status: 404 }); })
    };
    URL.createObjectURL = vi.fn(() => 'blob:local-upload');
    URL.revokeObjectURL = vi.fn();
    const file = new File(['photo'], 'new.png', { type: 'image/png' });
    const view = renderHook(() => useImageAccess(), {
      wrapper: ({ children }) => <ImageAccessProvider api={api}>{children}</ImageAccessProvider>
    });
    let uploaded;
    await act(async () => { uploaded = await view.result.current.upload(file); });
    expect(uploaded).toEqual({ imageId: 'new-unbound-image' });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(api.readImage).not.toHaveBeenCalled();
    expect(api.uploadImage).toHaveBeenCalledWith('data:image/png;base64,cGhvdG8=');
    view.unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
