const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|jpg|webp|gif|bmp);base64,[a-z\d+/=\s]+$/i;

export function createWebApi({ fetchImpl = window.fetch.bind(window), onUnauthorized } = {}) {
  let csrfToken = '';
  let privacyToken = '';
  let sessionEpoch = 0;
  let unauthorizedHandler = onUnauthorized;
  const accessListeners = new Set();
  function invalidateImages() { for (const listener of accessListeners) listener(); }

  function clearSession() {
    sessionEpoch += 1;
    csrfToken = '';
    privacyToken = '';
    invalidateImages();
  }

  async function request(path, { method = 'GET', body, blob = false, privacy = privacyToken, signal } = {}) {
    const epoch = sessionEpoch;
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (privacy) headers['X-Storage-Privacy'] = privacy;
    const response = await fetchImpl(path, {
      method, headers, credentials: 'same-origin', cache: 'no-store',
      ...(signal ? { signal } : {}),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 && path !== '/api/login' && epoch === sessionEpoch && !signal?.aborted) {
        clearSession();
        unauthorizedHandler?.();
      }
      throw Object.assign(new Error(payload.error || '请求失败，请稍后重试'), { status: response.status, code: payload.code });
    }
    const result = await (blob ? response.blob() : response.json());
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
    return result;
  }

  return {
    clearSession,
    setOnUnauthorized(handler) { unauthorizedHandler = handler; },
    onAccessChange(listener) { accessListeners.add(listener); return () => accessListeners.delete(listener); },
    clearPrivacy: () => { privacyToken = ''; invalidateImages(); },
    async session({ signal } = {}) {
      const epoch = sessionEpoch;
      const result = await request('/api/session', { privacy: '', signal });
      if (epoch === sessionEpoch) csrfToken = result.authenticated ? result.csrfToken || '' : '';
      return result;
    },
    async login(password, { signal } = {}) {
      const epoch = ++sessionEpoch;
      csrfToken = '';
      privacyToken = '';
      invalidateImages();
      const result = await request('/api/login', { method: 'POST', body: { password }, privacy: '', signal });
      if (epoch === sessionEpoch) csrfToken = result.csrfToken || '';
      return result;
    },
    async logout() {
      privacyToken = '';
      invalidateImages();
      try { return await request('/api/logout', { method: 'POST' }); }
      finally { clearSession(); }
    },
    async openPrivacy(password) {
      privacyToken = '';
      invalidateImages();
      const result = await request('/api/privacy/open', { method: 'POST', body: { password }, privacy: '' });
      privacyToken = result.unlocked === true ? result.privacyToken || '' : '';
      invalidateImages();
      return privacyToken ? { unlocked: true, privacyToken } : { unlocked: false };
    },
    closePrivacy() {
      const previousToken = privacyToken;
      privacyToken = '';
      invalidateImages();
      return request('/api/privacy/close', { method: 'POST', privacy: previousToken });
    },
    getProject: ({ signal } = {}) => request('/api/project', { signal }),
    saveProject: (project) => request('/api/project', { method: 'PUT', body: project }),
    uploadImage: (dataUrl) => request('/api/images', { method: 'POST', body: { dataUrl } }),
    copyImage: (imageId) => request(`/api/images/${encodeURIComponent(imageId)}/copy`, { method: 'POST' }),
    readImage: (imageId, { signal, variant } = {}) => request(`/api/images/${encodeURIComponent(imageId)}${variant === 'card' ? '?variant=card' : ''}`, { blob: true, signal }),
    backup: () => request('/api/backup'),
    importProject: (payload) => request('/api/import', { method: 'POST', body: payload })
  };
}

export function readFileAsDataUrl(file) {
  if (!file || !/^image\/(?:png|jpeg|webp|gif|bmp)$/i.test(file.type)) return Promise.reject(new Error('请选择 PNG、JPEG、WebP、GIF 或 BMP 图片'));
  if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error('图片不能超过 20 MB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
    reader.readAsDataURL(file);
  });
}

export function parseImportDocument(value) {
  const project = value?.project || value;
  if (value?.publicProject || project?.publicProject || project?.privacy?.locked || (project?.privacy?.required && !project?.privacy?.enabled) || /encrypt/i.test(String(value?.format || project?.format || ''))) {
    throw new Error('这是桌面加密项目。请使用 NAS 迁移工具指定源目录和网站地址，输入原密码后直接迁移全部物品及图片，不能只导入公开部分。');
  }
  if (project?.scope === 'ordinary') throw new Error('这是仅包含普通物品的项目，请选择完整项目备份，避免遗漏隐私物品。');
  if (!project || !Array.isArray(project.items) || !Array.isArray(project.categories) || !Array.isArray(project.locations)) {
    throw new Error('请选择完整的项目 JSON 或迁移文件');
  }
  const images = value?.images || {};
  for (const item of project.items) {
    if (item.imagePath && !IMAGE_DATA_URL.test(images[item.imagePath] || '')) {
      throw new Error('迁移文件缺少物品图片，请使用迁移工具打包原项目图片后重新导入。');
    }
  }
  return { project, images };
}
