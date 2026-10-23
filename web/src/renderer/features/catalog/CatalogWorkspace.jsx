import { useEffect, useMemo, useState } from 'react';

import { canAddChild, getChildEntries } from '../../lib/project-data';
import NodeEditorPane from './NodeEditorPane';
import TreePanel from './TreePanel';

const TITLES = {
  category: {
    title: '分类'
  },
  location: {
    title: '位置'
  }
};

const CREATE_TITLES = {
  root: '新增顶级',
  sibling: '新增同级',
  child: '新增下级'
};

export default function CatalogWorkspace({
  mode,
  entries,
  selectedId,
  onSelect,
  onAddRoot,
  onAddSibling,
  onAddChild,
  onDelete,
  onUpdate,
  onReorder,
  onSaveOrder,
  saveOnConfirm = false,
  canManagePrivacy = true,
  onRequireEdit
}) {
  const [internalSelectedId, setInternalSelectedId] = useState(entries[0]?.id || null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const [sorting, setSorting] = useState(false);
  const effectiveSelectedId = selectedId ?? internalSelectedId;
  const treeTitle = mode === 'category' ? '分类目录' : '位置目录';
  const selectedNode = useMemo(
    () => entries.find((entry) => entry.id === effectiveSelectedId) || null,
    [effectiveSelectedId, entries]
  );
  const siblings = useMemo(() => selectedNode ? getChildEntries(entries, selectedNode.parentId) : [], [entries, selectedNode]);
  const selectedIndex = siblings.findIndex(entry => entry.id === effectiveSelectedId);
  const editorNode = pendingCreate
    ? {
        id: `draft_${pendingCreate.action}`,
        name: '',
        level: pendingCreate.level,
        parentId: pendingCreate.parentId
      }
    : selectedNode;

  useEffect(() => {
    setPendingCreate(null);
    setSorting(false);
  }, [mode]);

  function handleReorder(nodeId, targetId, position) {
    if (onRequireEdit?.() === false) return;
    onReorder?.(mode, nodeId, targetId, position);
  }

  function moveSelected(direction) {
    const target = siblings[selectedIndex + direction];
    if (selectedNode && target) handleReorder(selectedNode.id, target.id, direction < 0 ? 'before' : 'after');
  }

  function handleSelect(nodeId) {
    setPendingCreate(null);
    setInternalSelectedId(nodeId);
    onSelect?.(mode, nodeId);
  }

  function beginCreate(action) {
    if (onRequireEdit?.() === false) return;
    if (action === 'root') {
      setPendingCreate({
        action,
        level: 1,
        parentId: null,
        title: CREATE_TITLES[action]
      });
      return;
    }

    if (!selectedNode) {
      return;
    }

    if (action === 'sibling') {
      setPendingCreate({
        action,
        level: selectedNode.level,
        parentId: selectedNode.parentId || null,
        title: CREATE_TITLES[action]
      });
      return;
    }

    if (action === 'child' && canAddChild(mode, selectedNode)) {
      setPendingCreate({
        action,
        level: selectedNode.level + 1,
        parentId: selectedNode.id,
        title: CREATE_TITLES[action]
      });
    }
  }

  async function handleConfirmCreate(draft) {
    if (!pendingCreate) {
      return;
    }

    if (pendingCreate.action === 'root') {
      await onAddRoot?.(mode, draft.name, { isPrivate: draft.isPrivate });
    } else if (pendingCreate.action === 'sibling') {
      await onAddSibling?.(mode, draft.name, { isPrivate: draft.isPrivate });
    } else if (pendingCreate.action === 'child') {
      await onAddChild?.(mode, draft.name, { isPrivate: draft.isPrivate });
    }

    setPendingCreate(null);
  }

  return (
    <section className="catalog-workspace">
      <div className="catalog-workspace__header">
        <div className="catalog-workspace__title">
          <h2>{TITLES[mode].title}</h2>
        </div>
      </div>

      <div className="catalog-layout">
        <aside className="catalog-tree-panel">
          <div className="catalog-tree-panel__header">
            <span>{treeTitle}</span>
            <div className="catalog-tree-panel__tools">
              <strong>{entries.length} 个节点</strong>
              {onReorder ? <button type="button" className="secondary-button catalog-sort-toggle" aria-pressed={sorting} onClick={() => {
                if (onRequireEdit?.() !== false) setSorting(current => !current);
              }}>{sorting ? '收起排序' : '排序'}</button> : null}
            </div>
          </div>
          <div className="catalog-directory-actions" aria-label={`${treeTitle}操作`}>
            <button className="secondary-button" type="button" onClick={() => beginCreate('root')}>
              新增顶级
            </button>
            <button className="secondary-button" type="button" onClick={() => beginCreate('sibling')} disabled={!selectedNode}>
              新增同级
            </button>
            <button className="primary-button" type="button" onClick={() => beginCreate('child')} disabled={!canAddChild(mode, selectedNode)}>
              新增下级
            </button>
            <button className="ghost-button danger-button" type="button" onClick={() => onDelete(mode)} disabled={!selectedNode}>
              删除节点
            </button>
          </div>
          {sorting ? <div className="catalog-sort-controls" aria-label={`${treeTitle}排序`}>
            <p>拖动手柄调整同级顺序，排好后保存。</p>
            <div className="catalog-sort-controls__actions">
              <button className="secondary-button" type="button" disabled={selectedIndex <= 0} onClick={() => moveSelected(-1)}>上移</button>
              <button className="secondary-button" type="button" disabled={selectedIndex < 0 || selectedIndex >= siblings.length - 1} onClick={() => moveSelected(1)}>下移</button>
              {onSaveOrder ? <button className="primary-button" type="button" onClick={onSaveOrder}>保存排序</button> : null}
            </div>
          </div> : null}
          <TreePanel key={mode} entries={entries} selectedId={effectiveSelectedId} onSelect={handleSelect} sorting={sorting} onReorder={handleReorder} />
        </aside>
        <NodeEditorPane
          canManagePrivacy={canManagePrivacy}
          mode={mode}
          entries={entries}
          node={editorNode}
          onUpdate={onUpdate}
          onRequireEdit={onRequireEdit}
          saveOnConfirm={saveOnConfirm}
          isCreate={Boolean(pendingCreate)}
          title={pendingCreate?.title}
          onConfirmCreate={handleConfirmCreate}
          onCancel={() => setPendingCreate(null)}
        />
      </div>
    </section>
  );
}
