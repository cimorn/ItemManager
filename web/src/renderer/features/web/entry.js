import { createWebApi } from './api';

// This controller deliberately has no React or shared-style dependency. The form
// is already usable for typing while session restore and app download overlap.
export function startWebEntry({ root, fetchImpl, loadApp, timeoutMs = 15000 }) {
  const form = root.querySelector('#entry-login');
  const password = form.querySelector('input');
  const submit = form.querySelector('[type=submit]');
  const retry = form.querySelector('[data-entry-retry]');
  const feedback = form.querySelector('[data-entry-feedback]');
  const api = createWebApi({ fetchImpl });
  let epoch = 0;
  let busy = false;
  let stopped = false;
  let finished = false;
  let activeController;
  let modulePromise;
  let moduleFailed = false;
  let ready;
  const timers = new Set();

  function preload() {
    if (!modulePromise) {
      try { modulePromise = Promise.resolve(loadApp()); }
      catch (error) { modulePromise = Promise.reject(error); }
      // Rejections may happen while the user is still typing. Keep them handled
      // and retryable without discarding a successful ordinary bootstrap.
      modulePromise.catch(() => { moduleFailed = true; });
    }
    return modulePromise;
  }

  function bounded(promise, controller) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        controller?.abort();
        reject(new Error('连接超时，请重试'));
      }, timeoutMs);
      timers.add(timer);
      Promise.resolve(promise).then(resolve, reject).finally(() => {
        clearTimeout(timer);
        timers.delete(timer);
      });
    });
  }

  function updateButton() { submit.disabled = stopped || busy || !password.value; }
  function status(message, error = false) {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.setAttribute('role', error ? 'alert' : 'status');
  }
  function failed(error, attempt) {
    if (stopped || attempt !== epoch) return;
    busy = false;
    updateButton();
    retry.hidden = false;
    retry.disabled = false;
    status(error.message || '连接失败，请重试', true);
    password.focus();
  }
  async function open(project, attempt) {
    if (stopped || attempt !== epoch) return;
    ready = { project, attempt };
    busy = true;
    updateButton();
    status('正在打开物品…');
    const { mountWebApp } = await bounded(preload());
    if (stopped || attempt !== epoch) return;
    password.value = '';
    cleanup();
    mountWebApp(root, { api, project });
  }
  async function restore() {
    const attempt = ++epoch;
    activeController?.abort();
    const controller = activeController = new AbortController();
    retry.hidden = true;
    status('');
    try {
      const session = await bounded(api.session({ signal: controller.signal }), controller);
      if (stopped || attempt !== epoch || !session.authenticated) return;
      const project = await bounded(api.getProject({ signal: controller.signal }), controller);
      await open(project, attempt);
    } catch (error) { failed(error, attempt); }
  }
  async function login(event) {
    event.preventDefault();
    if (busy || !password.value || stopped) return;
    const attempt = ++epoch;
    activeController?.abort();
    const controller = activeController = new AbortController();
    ready = null;
    busy = true;
    let submittedPassword = password.value;
    password.value = '';
    updateButton();
    retry.hidden = true;
    status('登录中…');
    try {
      const request = api.login(submittedPassword, { signal: controller.signal });
      submittedPassword = '';
      await bounded(request, controller);
      if (stopped || attempt !== epoch) return;
      const project = await bounded(api.getProject({ signal: controller.signal }), controller);
      await open(project, attempt);
    } catch (error) { failed(error, attempt); }
  }
  function retryEntry() {
    if (busy || stopped) return;
    retry.hidden = true;
    if (moduleFailed) { modulePromise = null; moduleFailed = false; }
    const attempt = epoch;
    if (ready && ready.attempt === attempt) void open(ready.project, attempt).catch((error) => failed(error, attempt));
    else void restore();
  }
  function pause() {
    stopped = true;
    epoch += 1;
    activeController?.abort();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    password.value = '';
    ready = null;
    busy = false;
    retry.hidden = true;
    status('');
    updateButton();
  }
  function hide() { pause(); api.clearSession(); }
  function show(event) {
    if (!event.persisted || !stopped || finished) return;
    stopped = false;
    if (moduleFailed) { modulePromise = null; moduleFailed = false; }
    updateButton();
    preload();
    void restore();
  }
  function cleanup() {
    finished = true;
    pause();
    form.removeEventListener('submit', login);
    password.removeEventListener('input', updateButton);
    retry.removeEventListener('click', retryEntry);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
  }
  function dispose() { cleanup(); api.clearSession(); }

  form.addEventListener('submit', login);
  password.addEventListener('input', updateButton);
  retry.addEventListener('click', retryEntry);
  // A cached document keeps this controller alive. Suspend its credentials and
  // requests on navigation, then revalidate the cookie when that page returns.
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  updateButton();
  // Start immediately, before waiting for the session endpoint or user input.
  // Calling loadApp synchronously also lets the browser discover its chunks now.
  preload();
  void restore();
  return dispose;
}
