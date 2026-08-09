import { useEffect, useMemo, useState } from 'react';

import { canAddChild } from '../../lib/project-data';
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
  onUpdate
}) {
  const [internalSelectedId, setInternalSelectedId] = useState(entries[0]?.id || null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const effectiveSelectedId = selectedId ?? internalSelectedId;
  const treeTitle = mode === 'category' ? '分类目录' : '位置目录';
  const selectedNode = useMemo(
    () => entries.find((entry) => entry.id === effectiveSelectedId) || null,
    [effectiveSelectedId, entries]
  );
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
  }, [mode]);

  function handleSelect(nodeId) {
    setPendingCreate(null);
    setInternalSelectedId(nodeId);
    onSelect?.(mode, nodeId);
  }

  function beginCreate(action) {
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

  function handleConfirmCreate(draft) {
    if (!pendingCreate) {
      return;
    }

    if (pendingCreate.action === 'root') {
      onAddRoot?.(mode, draft.name);
    } else if (pendingCreate.action === 'sibling') {
      onAddSibling?.(mode, draft.name);
    } else if (pendingCreate.action === 'child') {
      onAddChild?.(mode, draft.name);
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
            <strong>{entries.length} 个节点</strong>
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
          <TreePanel entries={entries} selectedId={effectiveSelectedId} onSelect={handleSelect} />
        </aside>
        <NodeEditorPane
          mode={mode}
          entries={entries}
          node={editorNode}
          onUpdate={onUpdate}
          isCreate={Boolean(pendingCreate)}
          title={pendingCreate?.title}
          onConfirmCreate={handleConfirmCreate}
          onCancel={() => setPendingCreate(null)}
        />
      </div>
    </section>
  );
}
