import { useEffect, useMemo, useState } from 'react';

import { buildTree } from '../../lib/project-data';

function countDescendants(node) {
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
}

function getAncestorIds(entries, nodeId) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ancestorIds = [];
  let parentId = byId.get(nodeId)?.parentId || null;

  while (parentId) {
    ancestorIds.push(parentId);
    parentId = byId.get(parentId)?.parentId || null;
  }

  return ancestorIds;
}

function TreeNode({ node, selectedId, expandedIds, onSelect, onToggle }) {
  const isSelected = node.id === selectedId;
  const nodeLabel = node.name || '未命名节点';
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const childCount = countDescendants(node);

  function handleSelect() {
    onSelect(node.id);

    if (hasChildren && !isExpanded) {
      onToggle(node.id);
    }
  }

  return (
    <li className={`tree-node tree-node--level-${node.level}`}>
      <div className={`tree-row ${isSelected ? 'is-selected' : ''}`}>
        {hasChildren ? (
          <button
            className="tree-toggle"
            type="button"
            aria-label={`${isExpanded ? '收起' : '展开'} ${nodeLabel}`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(node.id)}
          >
            <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
          </button>
        ) : (
          <span className="tree-toggle-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          role="treeitem"
          aria-label={nodeLabel}
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
          className={`tree-item ${isSelected ? 'is-selected' : ''}`}
          onClick={handleSelect}
        >
          <span className="tree-item__title">{nodeLabel}</span>
          {hasChildren ? <span className="tree-item__meta">{childCount} 个下级</span> : null}
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <ul role="group" className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function TreePanel({ entries, selectedId, onSelect }) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [expandedIds, setExpandedIds] = useState(() => new Set(getAncestorIds(entries, selectedId)));

  useEffect(() => {
    const ancestorIds = getAncestorIds(entries, selectedId);

    if (!ancestorIds.length) {
      return;
    }

    setExpandedIds((current) => {
      const next = new Set(current);
      let changed = false;

      ancestorIds.forEach((ancestorId) => {
        if (!next.has(ancestorId)) {
          next.add(ancestorId);
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [entries, selectedId]);

  function handleToggle(nodeId) {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  }

  if (!entries.length) {
    return (
      <div className="tree-empty">
        <p>还没有目录节点</p>
        <span>先从左上角新增顶级开始，后续再添加同级或下级。</span>
      </div>
    );
  }

  return (
    <ul className="tree-root" role="tree" aria-label="目录树">
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={handleToggle}
        />
      ))}
    </ul>
  );
}
