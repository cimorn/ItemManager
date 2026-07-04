import { useMemo, useState } from 'react';

import ItemEditorModal from './ItemEditorModal';
import ItemFilterChips from './ItemFilterChips';
import ItemGalleryGrid from './ItemGalleryGrid';
import { buildFilterGroups, buildItemCardView, buildTagChips } from './item-gallery-selectors';
import { buildLeafEntries, normalizeTagCodes } from '../../lib/project-data';

export default function ItemsGalleryPage({
  allItems = [],
  projectDir = '',
  items = [],
  categories = [],
  locations = [],
  tagPrefixes = {},
  filters = {
    mainCategoryId: '',
    subCategoryId: '',
    locationId: '',
    tag: ''
  },
  selectedItemId = null,
  onFilterChange,
  onSelectItem,
  onOpenCreate,
  onOpenEdit,
  onCreateItem,
  onSaveItem,
  onDeleteItem,
  onBulkUpdateItems,
  onImportImage
}) {
  const [modalState, setModalState] = useState({
    open: false,
    mode: 'edit',
    itemId: null
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState(() => new Set());
  const [bulkDraft, setBulkDraft] = useState({
    categoryId: '',
    locationId: '',
    tagMode: 'append',
    tagsText: ''
  });

  const groups = useMemo(() => buildFilterGroups(categories, locations, filters, allItems), [allItems, categories, locations, filters]);
  const availableTags = useMemo(() => buildTagChips(allItems).map((chip) => chip.label), [allItems]);
  const galleryItems = useMemo(() => items.map((item) => buildItemCardView(item, projectDir)), [items, projectDir]);
  const categoryOptions = useMemo(() => buildLeafEntries(categories), [categories]);
  const locationOptions = useMemo(() => buildLeafEntries(locations), [locations]);
  const editingItem = useMemo(
    () => allItems.find((item) => item.id === modalState.itemId) || null,
    [allItems, modalState.itemId]
  );
  const selectedCount = bulkSelectedIds.size;

  function handleOpenCreate() {
    onOpenCreate?.();
    setModalState({
      open: true,
      mode: 'create',
      itemId: null
    });
  }

  function handleOpenEdit(itemId) {
    if (bulkMode) {
      setBulkSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
      return;
    }

    onSelectItem?.(itemId);
    onOpenEdit?.(itemId);
    setModalState({
      open: true,
      mode: 'edit',
      itemId
    });
  }

  function handleCloseModal() {
    setModalState((current) => ({ ...current, open: false }));
  }

  function handleSaveItem(draft) {
    if (modalState.mode === 'create') {
      onCreateItem?.(draft);
    } else if (draft?.id) {
      onSaveItem?.(draft.id, draft);
    }

    handleCloseModal();
  }

  function toggleBulkMode() {
    setBulkMode((current) => !current);
    setBulkSelectedIds(new Set());
  }

  function selectVisibleItems() {
    setBulkSelectedIds(new Set(galleryItems.map((item) => item.id)));
  }

  function clearBulkSelection() {
    setBulkSelectedIds(new Set());
  }

  function updateBulkDraft(patch) {
    setBulkDraft((current) => ({
      ...current,
      ...patch
    }));
  }

  function applyBulkUpdate() {
    const selectedIds = [...bulkSelectedIds];
    const tags = normalizeTagCodes(bulkDraft.tagsText);
    const patch = {};

    if (bulkDraft.categoryId) {
      patch.categoryId = bulkDraft.categoryId;
    }

    if (bulkDraft.locationId) {
      patch.locationId = bulkDraft.locationId;
    }

    if (tags.length) {
      patch.tagMode = bulkDraft.tagMode;
      patch.tags = tags;
    }

    onBulkUpdateItems?.(selectedIds, patch);
    setBulkSelectedIds(new Set());
    setBulkDraft((current) => ({ ...current, tagsText: '' }));
  }

  return (
    <section className="items-gallery-page items-gallery-page--top">
      <div className="items-gallery-page__search-row">
        <ItemFilterChips
          groups={groups}
          filters={filters}
          onChange={onFilterChange}
          showMainGroup={false}
          className="items-filter-strip--toolbar"
        />

        <div className="items-gallery-page__toolbar-side items-gallery-page__toolbar-side--actions">
          <button className="secondary-button" type="button" onClick={toggleBulkMode}>
            {bulkMode ? '取消批量' : '批量修改'}
          </button>
          <button className="primary-button" type="button" onClick={handleOpenCreate}>
            新增物品
          </button>
        </div>
      </div>

      {bulkMode ? (
        <section className="bulk-edit-panel" aria-label="批量修改面板">
          <div className="bulk-edit-panel__summary">
            <strong>已选 {selectedCount} 个</strong>
            <button className="secondary-button" type="button" onClick={selectVisibleItems} disabled={!galleryItems.length}>
              全选当前
            </button>
            <button className="ghost-button" type="button" onClick={clearBulkSelection} disabled={!selectedCount}>
              清空
            </button>
          </div>
          <label className="field">
            <span>分类</span>
            <select aria-label="批量分类" value={bulkDraft.categoryId} onChange={(event) => updateBulkDraft({ categoryId: event.target.value })}>
              <option value="">不修改分类</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>位置</span>
            <select aria-label="批量位置" value={bulkDraft.locationId} onChange={(event) => updateBulkDraft({ locationId: event.target.value })}>
              <option value="">不修改位置</option>
              {locationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>标签处理</span>
            <select value={bulkDraft.tagMode} onChange={(event) => updateBulkDraft({ tagMode: event.target.value })}>
              <option value="append">追加标签</option>
              <option value="replace">替换标签</option>
              <option value="remove">移除标签</option>
            </select>
          </label>
          <label className="field bulk-edit-panel__tags">
            <span>标签</span>
            <input
              aria-label="批量标签"
              value={bulkDraft.tagsText}
              onChange={(event) => updateBulkDraft({ tagsText: event.target.value })}
              placeholder="例如：YF-009、SM-012"
            />
          </label>
          <button className="primary-button" type="button" onClick={applyBulkUpdate} disabled={!selectedCount}>
            应用批量修改
          </button>
        </section>
      ) : null}

      <ItemGalleryGrid
        items={galleryItems}
        selectedItemId={selectedItemId}
        bulkMode={bulkMode}
        bulkSelectedIds={bulkSelectedIds}
        onSelect={handleOpenEdit}
      />

      <ItemEditorModal
        open={modalState.open}
        mode={modalState.mode}
        item={modalState.mode === 'edit' ? editingItem : null}
        categories={categories}
        locations={locations}
        availableTags={availableTags}
        tagPrefixes={tagPrefixes}
        projectDir={projectDir}
        onSave={handleSaveItem}
        onClose={handleCloseModal}
        onDelete={(itemId) => {
          onDeleteItem?.(itemId);
          handleCloseModal();
        }}
        onImportImage={onImportImage}
      />
    </section>
  );
}
