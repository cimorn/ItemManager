import { useEffect, useState } from 'react';

import { getCatalogValidation, getParentOptions, hasSiblingCatalogName, toText } from '../../lib/project-data';

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
  onCancel
}) {
  const [draftName, setDraftName] = useState(node?.name || '');
  const [draftParentId, setDraftParentId] = useState(node?.parentId || '');

  useEffect(() => {
    setDraftName(node?.name || '');
    setDraftParentId(node?.parentId || '');
  }, [node?.id, node?.name, node?.parentId]);

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
  const duplicateName = hasSiblingCatalogName(entries, node.id, cleanDraftParentId, draftName);
  const hasChanges = isCreate || cleanDraftName !== node.name || cleanDraftParentId !== (node.parentId || null);
  const canConfirm = Boolean(cleanDraftName && !duplicateName && hasChanges);

  function handleNameChange(event) {
    setDraftName(event.target.value);
  }

  function handleCompositionEnd(event) {
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
  }

  function handleConfirm() {
    if (!canConfirm) {
      return;
    }

    if (isCreate) {
      onConfirmCreate?.({
        name: cleanDraftName,
        parentId: cleanDraftParentId
      });
      return;
    }

    const patch = {
      name: cleanDraftName
    };

    if (node.level > 1) {
      patch.parentId = cleanDraftParentId;
    }

    onUpdate?.(mode, node.id, patch);
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
            onChange={handleNameChange}
            onCompositionEnd={handleCompositionEnd}
          />
        </label>

        {node.level > 1 && !isCreate ? (
          <label className="field">
            <span>父级</span>
            <select value={draftParentId || ''} onChange={(event) => setDraftParentId(event.target.value)}>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="catalog-editor-actions">
        <button className="secondary-button" type="button" onClick={handleCancel}>
          取消
        </button>
        <button className="primary-button" type="button" onClick={handleConfirm} disabled={!canConfirm}>
          确定
        </button>
      </div>

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
