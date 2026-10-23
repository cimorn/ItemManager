import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { readFileAsDataUrl } from './api';

const ImageAccessContext = createContext(null);
const limit = (value, fallback, maximum, minimum = 0) => Number.isSafeInteger(value) && value >= minimum ? Math.min(value, maximum) : fallback;

function createImageAccess(api, options) {
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 760;
  const maxConcurrent = limit(options.maxConcurrent, mobile ? 2 : 4, 8, 1);
  const maxQueued = limit(options.maxQueued, 48, 128);
  const maxEntries = limit(options.maxEntries, 128, 512, 1);
  const maxBytes = limit(options.maxBytes, 64 * 1024 * 1024, 128 * 1024 * 1024);
  const attemptTimeoutMs = limit(options.attemptTimeoutMs, 12000, 12000, 1);
  const entries = new Map();
  const queue = [];
  const capacityListeners = new Set();
  let active = true;
  let running = 0;
  let retainedBytes = 0;
  let lifecycle = 0;
  let capacityScheduled = false;
  const capacityError = (requiredBytes = 0) => Object.assign(new Error('图片正在读取，请稍后重试'), { code: 'IMAGE_CAPACITY', requiredBytes });

  function canRetryCapacity({ imageId, requiredBytes }) {
    if (entries.has(imageId)) return true;
    if (running >= maxConcurrent && queue.length >= maxQueued) return false;
    let pinnedEntries = entries.size;
    let pinnedBytes = retainedBytes;
    for (const entry of entries.values()) if (entry.url && !entry.users) {
      pinnedEntries--; pinnedBytes -= entry.size;
    }
    return pinnedEntries < maxEntries && pinnedBytes + requiredBytes <= maxBytes;
  }
  function notifyCapacity() {
    if (!active || capacityScheduled || !capacityListeners.size) return;
    capacityScheduled = true;
    queueMicrotask(() => {
      capacityScheduled = false;
      if (!active) return;
      // A one-shot snapshot coalesces releases and completions without turning
      // a byte-blocked preview into a network retry loop.
      for (const listener of [...capacityListeners]) if (capacityListeners.has(listener) && canRetryCapacity(listener)) {
        capacityListeners.delete(listener); listener.retry();
      }
    });
  }

  function remove(entry) {
    if (entries.get(entry.id) !== entry) return;
    entries.delete(entry.id);
    const queuedIndex = queue.indexOf(entry);
    if (queuedIndex !== -1) queue.splice(queuedIndex, 1);
    entry.controller?.abort();
    if (entry.url) { URL.revokeObjectURL(entry.url); retainedBytes -= entry.size; }
    entry.resolve('');
    notifyCapacity();
  }
  function room(bytes, extraEntries = 0, except) {
    for (const entry of entries.values()) {
      if (retainedBytes + bytes <= maxBytes && entries.size + extraEntries <= maxEntries) break;
      // Visible cards retain their URLs until leaving the viewport or
      // unmounting. Only unused previews can be evicted.
      if (entry !== except && entry.url && entry.users === 0) remove(entry);
    }
    return retainedBytes + bytes <= maxBytes && entries.size + extraEntries <= maxEntries;
  }
  function touch(entry) { entries.delete(entry.id); entries.set(entry.id, entry); }
  function readAttempt(entry) {
    const controller = new AbortController();
    const cancelled = Object.assign(new Error('图片读取已取消'), { code: 'IMAGE_CANCELLED' });
    let timer, onAbort;
    const attempt = new Promise((resolve, reject) => {
      onAbort = () => { reject(cancelled); controller.abort(); };
      entry.controller.signal.addEventListener('abort', onAbort, { once: true });
      if (entry.controller.signal.aborted) { onAbort(); return; }
      timer = setTimeout(() => {
        reject(Object.assign(new Error('图片读取超时，请稍后再试'), { code: 'IMAGE_TIMEOUT' }));
        controller.abort();
      }, attemptTimeoutMs);
      // The deadline settles even if a transport ignores abort. Promise
      // handlers still consume any late response without creating a URL.
      try { Promise.resolve(api.readImage(entry.id, { signal: controller.signal, variant: 'card' })).then(resolve, reject); }
      catch (error) { reject(error); }
    });
    return attempt.finally(() => {
      clearTimeout(timer); entry.controller.signal.removeEventListener('abort', onAbort);
    });
  }
  function pump() {
    while (active && running < maxConcurrent && queue.length) {
      const entry = queue.shift();
      if (entries.get(entry.id) !== entry) continue;
      running++;
      entry.controller = new AbortController();
      void (async () => {
        try {
          let blob;
          for (let attempt = 0; attempt < 2; attempt++) {
            try { blob = await readAttempt(entry); break; }
            catch (error) {
              const transient = !error.status || (error.status >= 500 && error.status <= 599);
              if (attempt || !transient || error.code === 'IMAGE_CANCELLED' || error.name === 'AbortError' || entry.controller.signal.aborted || !active) throw error;
            }
          }
          if (!active || entries.get(entry.id) !== entry) return;
          if (!room(blob.size, 0, entry)) throw capacityError(blob.size);
          entry.url = URL.createObjectURL(blob); entry.size = blob.size; retainedBytes += blob.size;
          entry.resolve(entry.url);
        } catch (error) {
          if (entries.get(entry.id) === entry) { entries.delete(entry.id); entry.reject(error); }
        } finally { running--; pump(); notifyCapacity(); }
      })();
    }
  }
  function ensure(imageId, direct = false) {
    if (!imageId || !active) return null;
    if (entries.has(imageId)) {
      const entry = entries.get(imageId); entry.direct ||= direct; touch(entry); return entry;
    }
    if ((running >= maxConcurrent && queue.length >= maxQueued) || !room(0, 1)) throw capacityError();
    const entry = { id: imageId, url: '', size: 0, users: 0, direct };
    entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
    entries.set(imageId, entry); queue.push(entry); pump();
    return entry;
  }
  return {
    onCapacity(imageId, error, retry) {
      if (!active || error?.code !== 'IMAGE_CAPACITY' || error.requiredBytes > maxBytes) return () => {};
      const listener = { imageId, requiredBytes: error.requiredBytes, retry };
      capacityListeners.add(listener);
      // Capacity can have changed between rejection and this subscription.
      notifyCapacity();
      return () => capacityListeners.delete(listener);
    },
    load(imageId) {
      try { return ensure(imageId, true)?.promise || Promise.resolve(''); }
      catch (error) { return Promise.reject(error); }
    },
    acquire(imageId) {
      const entry = ensure(imageId);
      if (!entry) return { promise: Promise.resolve(''), release() {} };
      entry.users++;
      let released = false;
      return { promise: entry.promise, release() {
        if (released) return; released = true; entry.users--;
        if (entries.get(entry.id) !== entry) return;
        if (!entry.users && !entry.direct && !entry.url) remove(entry);
        else { touch(entry); notifyCapacity(); }
      } };
    },
    async upload(file) {
      if (!active) throw new Error('当前编辑已关闭');
      const dataUrl = await readFileAsDataUrl(file);
      if (!active) throw new Error('当前编辑已关闭');
      const result = await api.uploadImage(dataUrl);
      if (!active) throw new Error('当前编辑已关闭');
      // The editor owns its selected File and staged ID for Save/retry. It
      // displays no preview; saved cards read the bound image normally.
      return result;
    },
    async copy(imageId) {
      if (!active) throw new Error('当前编辑已关闭');
      const result = await api.copyImage(imageId);
      if (!active) throw new Error('当前编辑已关闭');
      return result;
    },
    dispose() {
      active = false;
      capacityListeners.clear();
      for (const entry of entries.values()) remove(entry);
      queue.length = 0;
    },
    mount() {
      const ticket = ++lifecycle;
      // React StrictMode remounts effects synchronously. Real unmounts still
      // revoke all URLs, while access changes call dispose synchronously.
      return () => queueMicrotask(() => { if (ticket === lifecycle) this.dispose(); });
    }
  };
}

export function ImageAccessProvider({ api, children, maxConcurrent, maxQueued, maxEntries, maxBytes, attemptTimeoutMs }) {
  const [scopeEpoch, setScopeEpoch] = useState(0);
  const access = useMemo(() => createImageAccess(api, { maxConcurrent, maxQueued, maxEntries, maxBytes, attemptTimeoutMs }), [api, scopeEpoch, maxConcurrent, maxQueued, maxEntries, maxBytes, attemptTimeoutMs]);
  useEffect(() => {
    const unmount = access.mount();
    const unsubscribe = api.onAccessChange?.(() => { access.dispose(); setScopeEpoch((value) => value + 1); });
    return () => { unsubscribe?.(); unmount(); };
  }, [access, api]);
  return <ImageAccessContext.Provider value={access}>{children}</ImageAccessContext.Provider>;
}

export function useImageAccess() { return useContext(ImageAccessContext); }

export function useImagePreviewState(imageId, fallback = '', { targetRef } = {}) {
  const access = useImageAccess();
  const [near, setNear] = useState({ access: null, imageId: '', visible: false });
  const [loaded, setLoaded] = useState({ access: null, imageId: '', url: '', status: 'loading' });
  const eligible = !targetRef || (near.access === access && near.imageId === imageId && near.visible);
  useEffect(() => {
    if (!access || !imageId || !targetRef) return undefined;
    let observer;
    let removeFallback;
    let cancelled = false;
    const updateVisible = (visible) => {
      if (!cancelled) setNear((current) => current.access === access && current.imageId === imageId && current.visible === visible ? current : { access, imageId, visible });
    };
    try {
      if (typeof IntersectionObserver !== 'function' || !targetRef.current) throw new Error('Observer unavailable');
      observer = new IntersectionObserver((records) => {
        updateVisible(!!records.at(-1)?.isIntersecting);
      }, { rootMargin: '240px 0px' });
      observer.observe(targetRef.current);
    } catch {
      const checkPosition = () => {
        const rectangle = targetRef.current?.getBoundingClientRect();
        updateVisible(!!rectangle && rectangle.bottom >= -240 && rectangle.top <= window.innerHeight + 240 && rectangle.right >= 0 && rectangle.left <= window.innerWidth);
      };
      checkPosition();
      // Capture also observes scroll events from the gallery's own container.
      window.addEventListener('scroll', checkPosition, { passive: true, capture: true });
      window.addEventListener('resize', checkPosition, { passive: true });
      removeFallback = () => { window.removeEventListener('scroll', checkPosition, true); window.removeEventListener('resize', checkPosition); };
    }
    return () => { cancelled = true; observer?.disconnect(); removeFallback?.(); };
  }, [access, imageId, targetRef]);
  useEffect(() => {
    if (!access || !imageId || !eligible) {
      setLoaded((current) => current.url ? { access: null, imageId: '', url: '' } : current);
      return undefined;
    }
    let cancelled = false;
    let preview;
    let unsubscribeCapacity;
    function failed(error) {
      if (cancelled) return;
      setLoaded({ access, imageId, url: '', status: 'error' });
      preview?.release(); preview = null;
      unsubscribeCapacity = access.onCapacity(imageId, error, attempt);
    }
    function attempt() {
      if (cancelled) return;
      unsubscribeCapacity?.(); unsubscribeCapacity = null;
      setLoaded({ access, imageId, url: '', status: 'loading' });
      try {
        preview = access.acquire(imageId);
        preview.promise.then((url) => {
          if (!cancelled) setLoaded({ access, imageId, url, status: url ? 'ready' : 'error' });
        }).catch(failed);
      } catch (error) { failed(error); }
    }
    attempt();
    return () => { cancelled = true; unsubscribeCapacity?.(); preview?.release(); };
  }, [access, imageId, eligible]);
  if (!access) return { url: fallback, status: fallback ? 'ready' : imageId ? 'loading' : 'none' };
  if (!imageId) return { url: '', status: 'none' };
  return eligible && loaded.access === access && loaded.imageId === imageId ? { url: loaded.url, status: loaded.status } : { url: '', status: 'loading' };
}

export function useImagePreview(imageId, fallback = '', options = {}) {
  return useImagePreviewState(imageId, fallback, options).url;
}
