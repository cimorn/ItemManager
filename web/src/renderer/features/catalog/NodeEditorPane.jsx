import { useEffect, useRef, useState } from 'react';

import { getCatalogValidation, getParentOptions, hasSiblingCatalogName, isCatalogNodePrivate, toText } from '../../lib/project-data';

const LEVEL_LABELS = {
  category: ['一级分类', '二级分类'],
  location: ['一级位置', '二级位置', '三级位置']
};

export default function NodeEditorPane({
  mode,
  entries,
  node,
  onUpdate,
  isCreate = false,
  title = '',
  onConfirmCreate,
  onCancel,
  saveOnConfirm = false,
  canManagePrivacy = true,
  onRequireEdit
}) {
  const [draftName, setDraftName] = useState(node?.name || '');
  const [draftParentId, setDraftParentId] = useState(node?.parentId || '');
  const [draftIsPrivate, setDraftIsPrivate] = useState(Boolean(node?.isPrivate));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);

  useEffect(() => {
    setDraftName(node?.name || '');
    setDraftParentId(node?.parentId || '');
    setDraftIsPrivate(Boolean(node?.isPrivate));
    setSaveError('');
  }, [node?.id, node?.name, node?.parentId, node?.isPrivate]);

  if (!node) {
    return (
      <section className="editor-pane catalog-editor">
        <div className="editor-empty">
          <h3>先选择一个节点</h3>
          <p>在左侧树里点选后，右侧就可以直接修改名称和父级。</p>
        </div>
      </section>
    );
  }

  const draftNode = {
    ...node,
    name: draftName,
    parentId: node.level === 1 ? null : draftParentId || null
  };
  const messages = getCatalogValidation(entries, draftNode, mode);
  const parentOptions = getParentOptions(entries, mode, node);
  const label = LEVEL_LABELS[mode][node.level - 1] || `第 ${node.level} 级`;
  const cleanDraftName = toText(draftName);
  const cleanDraftParentId = node.level === 1 ? null : draftParentId || null;
  const inheritedPrivate = isCatalogNodePrivate(
    [...entries.filter(entry => entry.id !== node.id), { ...draftNode, isPrivate: false }],
    node.id,
    { categoryNames: mode === 'category' ? ['Look'] : [] }
  );
  const duplicateName = hasSiblingCatalogName(entries, node.id, cleanDraftParentId, draftName);
  const hasChanges = isCreate || cleanDraftName !== node.name || cleanDraftParentId !== (node.parentId || null) || draftIsPrivate !== Boolean(node.isPrivate);
  const canConfirm = Boolean(cleanDraftName && !duplicateName && hasChanges);

  function handleNameChange(event) {
    if (onRequireEdit?.() === false) return;
    setDraftName(event.target.value);
    setSaveError('');
  }

  function handleCompositionEnd(event) {
    if (onRequireEdit?.() === false) return;
    const nextName = event.currentTarget.value;
    setDraftName(nextName);
  }

  function handleCancel() {
    if (isCreate) {
      onCancel?.();
      return;
    }

    setDraftName(node.name || '');
    setDraftParentId(node.parentId || '');
    setDraftIsPrivate(Boolean(node.isPrivate));
    setSaveError('');
  }

  async function handleConfirm() {
    if (!canConfirm || savingRef.current || onRequireEdit?.() === false) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      if (isCreate) {
        await onConfirmCreate?.({ name: cleanDraftName, parentId: cleanDraftParentId, isPrivate: draftIsPrivate });
      } else {
        const patch = { name: cleanDraftName, isPrivate: draftIsPrivate };
        if (node.level > 1) patch.parentId = cleanDraftParentId;
        await onUpdate?.(mode, node.id, patch);
      }
    } catch (error) {
      setSaveError(error.message || '保存失败，请重试');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="editor-pane catalog-editor">
      <div className="editor-pane__header">
        <div>
          <h3>{isCreate ? title || '新增节点' : node.name || '未命名节点'}</h3>
        </div>
        <span className="level-pill">{label}</span>
      </div>

      <div className="editor-grid">
        <label className="field">
          <span>名称</span>
          <input
            value={draftName}
            disabled={saving}
            onChange={handleNameChange}
            onCompositionEnd={handleCompositionEnd}
          />
        </label>

        {node.level > 1 && !isCreate ? (
          <label className="field">
            <span>父级</span>
            <select disabled={saving} value={draftParentId || ''} onChange={(event) => { if (onRequireEdit?.() !== false) { setDraftParentId(event.target.value); setSaveError(''); } }}>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {canManagePrivacy ? <label className="catalog-private-control">
        <input type="checkbox" checked={draftIsPrivate || inheritedPrivate} disabled={saving || inheritedPrivate}
          onChange={event => { if (onRequireEdit?.() !== false) { setDraftIsPrivate(event.target.checked); setSaveError(''); } }} />
        <span>隐私区</span>
      </label> : null}
      {canManagePrivacy && inheritedPrivate ? <p className="privacy-inheritance-hint">{mode === 'category' ? '名称为 Look 或父级属于隐私区，自动保护' : '父级属于隐私区，自动保护'}</p> : null}

      <div className="catalog-editor-actions">
        <button className="secondary-button" type="button" onClick={handleCancel} disabled={saving}>
          取消
        </button>
        <button className="primary-button" type="button" onClick={handleConfirm} disabled={!canConfirm || saving}>
          {saving ? '保存中…' : saveOnConfirm ? '保存' : '确定'}
        </button>
      </div>

      {saveError ? <p role="alert">{saveError}</p> : null}

      <div className="validation-card catalog-rules">
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
