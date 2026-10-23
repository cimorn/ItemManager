import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../layout/AppShell';
import { applyItemGalleryFilters } from '../items/item-gallery-selectors';
import { createProjectStore, useProjectStore } from '../../store/project-store';
import { sanitizeProject, syncProjectItems } from '../../lib/project-data';
import { createWebApi } from './api';
import { ImageAccessProvider } from './ImageAccessContext';
import './web.css';

export default function WebApp({ fetchImpl, bootstrap }) {
  const state = useProjectStore();
  const [authenticated, setAuthenticated] = useState(Boolean(bootstrap));
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [promptPassword, setPromptPassword] = useState('');
  const [privacyEpoch, setPrivacyEpoch] = useState(0);
  const [feedback, setFeedback] = useState({ message: '', error: false });
  const [conflict, setConflict] = useState(false);
  const operationRef = useRef(false);
  const requestEpoch = useRef(0);
  const expireRef = useRef(null);
  const [api] = useState(() => bootstrap?.api || createWebApi({ fetchImpl }));

  function message(text, error = false) { setFeedback({ message: text, error }); }
  function expire() {
    requestEpoch.current += 1;
    api.clearSession();
    state.setProject(null);
    setAuthenticated(false);
    setPrivacyOpen(false);
    setPasswordPromptOpen(false);
    setPromptPassword('');
    setPrivacyEpoch((value) => value + 1);
    setPassword('');
    message('登录已过期，请重新输入访问密码', true);
  }
  expireRef.current = expire;

  useEffect(() => {
    let cancelled = false;
    api.setOnUnauthorized(() => expireRef.current?.());
    if (bootstrap) {
      state.setProject(bootstrap.project);
      return () => { api.setOnUnauthorized(null); api.clearPrivacy(); };
    }
    const epoch = requestEpoch.current;
    state.setProject(null);
    api.clearPrivacy();
    async function initialize() {
      try {
        const session = await api.session();
        if (cancelled || epoch !== requestEpoch.current || !session.authenticated) return;
        const project = await api.getProject();
        if (cancelled || epoch !== requestEpoch.current) return;
        state.setProject(project);
        setAuthenticated(true);
      } catch (error) {
        if (!cancelled && epoch === requestEpoch.current) message(error.message || '连接失败，请重试', true);
      }
    }
    void initialize();
    return () => { cancelled = true; api.setOnUnauthorized(null); api.clearPrivacy(); };
  }, [api, bootstrap, state.setProject]);

  useEffect(() => {
    function warnUnsaved(event) {
      if (!useProjectStore.getState().dirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);

  async function run(action, { propagate = false } = {}) {
    if (operationRef.current) {
      if (propagate) throw new Error('正在保存，请稍后重试');
      return null;
    }
    const epoch = requestEpoch.current;
    operationRef.current = true;
    setBusy(true);
    try { return await action(epoch); }
    catch (error) {
      if (epoch === requestEpoch.current) {
        if (!propagate) message(error.message || '操作失败，请稍后重试', true);
        if (error.status === 409) setConflict(true);
      }
      if (propagate) throw error;
      return null;
    } finally { operationRef.current = false; setBusy(false); }
  }

  async function login(event) {
    event.preventDefault();
    if (operationRef.current) return;
    requestEpoch.current += 1;
    const submittedPassword = password;
    setPassword('');
    await run(async (epoch) => {
      await api.login(submittedPassword);
      const project = await api.getProject();
      if (epoch !== requestEpoch.current) return;
      state.setProject(project);
      setAuthenticated(true);
      message('');
    });
  }

  async function save() {
    await run(async (epoch) => {
      const draft = useProjectStore.getState().currentProject;
      if (!draft) return;
      const saved = await api.saveProject(draft);
      if (epoch !== requestEpoch.current) return;
      // Edits remain available during a network request. Do not replace newer work.
      if (useProjectStore.getState().currentProject === draft) useProjectStore.setState({ currentProject: sanitizeProject(saved), dirty: false });
      else useProjectStore.setState((current) => ({ currentProject: { ...current.currentProject, revision: saved.revision } }));
      setConflict(false);
      message(useProjectStore.getState().dirty ? '已保存，另有新修改尚未保存' : '项目已保存');
    });
  }

  async function saveItem(itemId, draft) {
    return persistItem(draft, itemId);
  }

  async function createItem(draft) {
    return persistItem(draft);
  }

  async function persistCatalog(action, mode, ...args) {
    return run(async (epoch) => {
      const original = useProjectStore.getState();
      if (!original.currentProject) throw new Error('项目暂时无法读取，请刷新页面重试');
      const staged = createProjectStore();
      staged.getState().setProject(original.currentProject);
      staged.setState({ selectedCatalogNodeIds: { ...original.selectedCatalogNodeIds } });
      staged.getState()[action](mode, ...args);
      if (!staged.getState().dirty) throw new Error('目录未保存，请检查名称是否与同级节点重复');
      const saved = await api.saveProject(staged.getState().currentProject);
      if (epoch !== requestEpoch.current) throw new Error('当前页面已更新，请重试');
      // run() serializes writes and makes the shell inert until this save finishes.
      useProjectStore.setState({
        currentProject: sanitizeProject(saved),
        dirty: false,
        selectedCatalogNodeIds: staged.getState().selectedCatalogNodeIds
      });
      setConflict(false);
      const savedNodeId = staged.getState().selectedCatalogNodeIds[mode];
      const savedEntries = mode === 'category' ? saved.categories : saved.locations;
      const hidden = savedNodeId && !savedEntries.some(node => node.id === savedNodeId);
      message(hidden && privacyOpen ? '已保存到 NAS，解锁隐私区后可查看' : `${mode === 'category' ? '分类' : '位置'}已保存到 NAS`);
      return saved;
    }, { propagate: true });
  }

  async function persistItem(draft, itemId) {
    return run(async (epoch) => {
      const original = useProjectStore.getState().currentProject;
      if (!original) throw new Error('项目暂时无法读取，请刷新页面重试');
      // Stage edits independently so a rejected save cannot reset the editor's draft.
      const staged = createProjectStore();
      staged.getState().setProject(original);
      if (itemId) staged.getState().saveItem(itemId, draft);
      else staged.getState().createItemFromDraft(draft);
      const candidate = staged.getState().currentProject;
      const savedItemId = itemId || staged.getState().selectedItemId;
      const saved = await api.saveProject(candidate);
      if (epoch !== requestEpoch.current) throw new Error('当前页面已更新，请重试');
      const current = useProjectStore.getState().currentProject;
      if (current === original) {
        useProjectStore.setState({ currentProject: sanitizeProject(saved), dirty: false, selectedItemId: savedItemId });
      } else {
        const savedItem = candidate.items.find((item) => item.id === savedItemId);
        const items = itemId ? current.items.map((item) => item.id === itemId ? savedItem : item) : [...current.items, savedItem];
        useProjectStore.setState({ currentProject: syncProjectItems({ ...current, items, revision: saved.revision }), dirty: true, selectedItemId: savedItemId });
      }
      setConflict(false);
      message(useProjectStore.getState().dirty ? '已保存，另有新修改尚未保存' : '项目已保存');
      return saved;
    }, { propagate: true });
  }

  async function requestPassword() {
    if (operationRef.current) return;
    if (useProjectStore.getState().dirty && !window.confirm('当前项目有未保存修改。可先取消并保存项目，确定继续吗？')) return;
    setPromptPassword('');
    setPasswordPromptOpen(true);
    if (!privacyOpen) return;
    const epoch = ++requestEpoch.current;
    // Purge synchronously before either network operation can finish.
    const closing = api.closePrivacy();
    state.setProject(null);
    setPrivacyOpen(false);
    setPrivacyEpoch((value) => value + 1);
    setConflict(false);
    await run(async () => {
      try { await closing; } catch (error) { if (error.status === 401) throw error; }
      const project = await api.getProject();
      if (epoch !== requestEpoch.current) return;
      state.setProject(project);
    });
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (operationRef.current) return;
    const submittedPassword = promptPassword;
    setPromptPassword('');
    setPasswordPromptOpen(false);
    await run(async (epoch) => {
      const result = await api.openPrivacy(submittedPassword);
      if (!result.unlocked) return;
      try {
        const project = await api.getProject();
        if (epoch !== requestEpoch.current) return;
        state.setProject(project);
        setPrivacyOpen(true);
        setPrivacyEpoch((value) => value + 1);
        message('');
      } catch (error) { await api.closePrivacy().catch(() => {}); throw error; }
    });
  }

  const project = state.currentProject;
  const visibleItems = useMemo(() => project ? applyItemGalleryFilters(project.items, project.categories, project.locations, state.itemFilters, state.search) : [], [project, state.itemFilters, state.search]);

  if (!authenticated) return <main className="web-login-page">
    <form className="dialog-card web-login-card" onSubmit={login}>
      <h1>物品管理</h1>
      <label className="field"><span>访问密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required /></label>
      {feedback.message ? <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}
      <button className="primary-button" type="submit" disabled={busy || !password}>{busy ? '登录中…' : '登录'}</button>
    </form>
  </main>;

  return <div className="web-app" aria-busy={busy}>
    {feedback.message || project?.storageWarning?.code === 'CLEANUP_PENDING' || conflict ? <div className="web-feedback">
      {feedback.message ? <span role={feedback.error ? 'alert' : 'status'}>{feedback.message}</span> : null}
      {project?.storageWarning?.code === 'CLEANUP_PENDING' ? <span role="status">图片清理尚未完成，将自动重试。物品数据已保存。</span> : null}
      {conflict ? <span>修改仍保留，请核对其他设备的更新后重试。</span> : null}
    </div> : null}
    {passwordPromptOpen ? <div className="dialog-backdrop" role="presentation">
      <form className="dialog-card web-password-dialog" role="dialog" aria-modal="true" aria-labelledby="web-password-title" onSubmit={submitPassword} onKeyDown={(event) => {
        if (event.key === 'Escape') { setPromptPassword(''); setPasswordPromptOpen(false); }
      }}>
        <h2 id="web-password-title">输入密码</h2>
        <label className="field"><span>密码</span><input type="password" autoComplete="off" autoFocus value={promptPassword} onChange={(event) => setPromptPassword(event.target.value)} /></label>
        <div className="dialog-actions">
          <button className="ghost-button" type="button" onClick={() => { setPromptPassword(''); setPasswordPromptOpen(false); }}>取消</button>
          <button className="primary-button" type="submit" disabled={busy}>确定</button>
        </div>
      </form>
    </div> : null}
    {project ? <ImageAccessProvider api={api} key={privacyEpoch}>
      <AppShell
        project={project} canManagePrivacy={privacyOpen} interactionDisabled={busy} catalogSaveOnConfirm
        selectedSection={state.selectedSection} selectedCatalogMode={state.selectedCatalogMode}
        selectedCatalogNodeId={state.selectedCatalogNodeIds[state.selectedCatalogMode]} selectedItemId={state.selectedItemId}
        visibleItems={visibleItems} search={state.search} filters={state.itemFilters}
        onSelectSection={state.setSelectedSection} onSetCatalogMode={state.setSelectedCatalogMode} onSelectCatalogNode={state.selectCatalogNode}
        onAddCatalogRoot={(...args) => persistCatalog('addCatalogRoot', ...args)} onAddCatalogSibling={(...args) => persistCatalog('addCatalogSibling', ...args)} onAddCatalogChild={(...args) => persistCatalog('addCatalogChild', ...args)}
        onDeleteCatalogNode={state.deleteCatalogNode} onUpdateCatalogNode={(...args) => persistCatalog('updateCatalogNode', ...args)} onReorderCatalogNode={state.reorderCatalogNode}
        onSearch={state.setSearch} onFilterChange={state.setItemFilters}
        onBrandClick={requestPassword}
        onCreateItem={createItem} onSelectItem={state.setSelectedItemId} onSaveItem={saveItem} onDeleteItem={state.deleteItem}
        onBulkUpdateItems={state.bulkUpdateItems} onSaveProject={save}
        onDeleteTag={state.deleteTag} onDeleteTags={state.deleteTags} onRenameTag={state.renameTag} onUpdateTagPrefix={state.updateTagPrefix}
      />
    </ImageAccessProvider> : <p className="web-loading" role="status">{busy ? '正在读取物品…' : '项目暂时无法读取，请刷新页面重试。'}</p>}
  </div>;
}
