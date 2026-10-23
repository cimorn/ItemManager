import { useEffect, useMemo, useRef, useState } from 'react';
import { getChildEntries } from '../../lib/project-data';

export default function useCatalogDrag({ entries, enabled, onReorder }) {
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const byId = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries]);

  function cancel() {
    gestureRef.current = null;
    setDrag(null);
  }

  useEffect(cancel, [entries, enabled]);

  function targetAt(x, y, sourceId) {
    const row = document.elementFromPoint(x, y)?.closest('[data-catalog-row]');
    if (!row || !rootRef.current?.contains(row)) return null;
    const source = byId.get(sourceId);
    const target = byId.get(row.dataset.catalogRow);
    if (!source || !target || source.id === target.id || (source.parentId || null) !== (target.parentId || null)) return null;
    const bounds = row.getBoundingClientRect();
    return { targetId: target.id, position: y < bounds.top + bounds.height / 2 ? 'before' : 'after' };
  }

  function handleProps(node, onSelect) {
    return {
      onPointerDown(event) {
        if (!enabled || event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onSelect(node.id);
        gestureRef.current = { sourceId: node.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
      },
      onPointerMove(event) {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return;
        gesture.active = true;
        const target = targetAt(event.clientX, event.clientY, gesture.sourceId);
        setDrag(current => current?.sourceId === gesture.sourceId && current?.targetId === target?.targetId && current?.position === target?.position
          ? current : { sourceId: gesture.sourceId, ...target });
      },
      onPointerUp(event) {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const target = gesture.active ? targetAt(event.clientX, event.clientY, gesture.sourceId) : null;
        cancel();
        if (target) onReorder?.(gesture.sourceId, target.targetId, target.position);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown(event) {
        if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const siblings = getChildEntries(entries, node.parentId);
        const index = siblings.findIndex(entry => entry.id === node.id);
        const target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (target) onReorder?.(node.id, target.id, event.key === 'ArrowUp' ? 'before' : 'after');
      },
      onClick: () => onSelect(node.id)
    };
  }

  return { rootRef, drag, handleProps };
}
