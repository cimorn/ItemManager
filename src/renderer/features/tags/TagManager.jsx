import { useEffect, useMemo, useState } from 'react';

import {
  buildTagSummaries,
  collectDescendantIds,
  getNextTagSuggestions,
  getNodeLineage,
  getTagPrefixForCategory,
  normalizeTagCode
} from '../../lib/project-data';

export default function TagManager({
  items = [],
  categories = [],
  locations = [],
  tagPrefixes = {},
  onDeleteTag,
  onDeleteTags,
  onRenameTag,
  onUpdateTagPrefix,
  showHeader = true
}) {
  const [query, setQuery] = useState('');
  const [categoryLevel1Filter, setCategoryLevel1Filter] = useState('');
  const [categoryLevel2Filter, setCategoryLevel2Filter] = useState('');
  const [locationLevel1Filter, setLocationLevel1Filter] = useState('');
  const [locationLevel2Filter, setLocationLevel2Filter] = useState('');
  const [locationLevel3Filter, setLocationLevel3Filter] = useState('');
  const [selectedTags, setSelectedTags] = useState(() => new Set());
  const [editingTag, setEditingTag] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [prefixDrafts, setPrefixDrafts] = useState(tagPrefixes);

  const categoryLevel1Options = useMemo(() => buildLevelOptions(categories, 1), [categories]);
  const categoryLevel2Options = useMemo(() => buildLevelOptions(categories, 2, categoryLevel1Filter), [categories, categoryLevel1Filter]);
  const locationLevel1Options = useMemo(() => buildLevelOptions(locations, 1), [locations]);
  const locationLevel2Options = useMemo(() => buildLevelOptions(locations, 2, locationLevel1Filter), [locations, locationLevel1Filter]);
  const locationLevel3Options = useMemo(() => buildLevelOptions(locations, 3, locationLevel2Filter), [locations, locationLevel2Filter]);
  const categoryFilter = categoryLevel2Filter || categoryLevel1Filter;
  const prefixEntries = useMemo(() => buildPrefixEntries(categories), [categories]);
  const visiblePrefixEntries = useMemo(() => {
    if (categoryLevel2Filter) {
      return prefixEntries.filter((entry) => entry.id === categoryLevel2Filter);
    }

    if (categoryLevel1Filter) {
      const categoryIds = collectDescendantIds(categories, categoryLevel1Filter);
      return prefixEntries.filter((entry) => categoryIds.has(entry.id));
    }

    return [];
  }, [categories, categoryLevel1Filter, categoryLevel2Filter, prefixEntries]);

  useEffect(() => {
    setPrefixDrafts((current) => (areSameRecord(current, tagPrefixes || {}) ? current : tagPrefixes || {}));
  }, [tagPrefixes]);

  const filteredItems = useMemo(() => {
    let nextItems = items;
    const locationFilter = locationLevel3Filter || locationLevel2Filter || locationLevel1Filter;

    if (categoryFilter) {
      const categoryIds = collectDescendantIds(categories, categoryFilter);
      nextItems = nextItems.filter((item) => categoryIds.has(item.categoryId));
    }

    if (locationFilter) {
      const locationIds = collectDescendantIds(locations, locationFilter);
      nextItems = nextItems.filter((item) => locationIds.has(item.locationId));
    }

    return nextItems;
  }, [categories, categoryFilter, items, locationLevel1Filter, locationLevel2Filter, locationLevel3Filter, locations]);

  const tagSummaries = useMemo(() => buildTagSummaries(filteredItems), [filteredItems]);
  const nextTags = useMemo(
    () => getNextTagSuggestions(tagSummaries.map((summary) => summary.tag), 4, getTagPrefixForCategory(categoryFilter, categories, tagPrefixes)),
    [categories, categoryFilter, tagPrefixes, tagSummaries]
  );
  const visibleSummaries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return tagSummaries;
    }

    return tagSummaries.filter((summary) => `${summary.tag} ${summary.itemNames.join(' ')}`.toLowerCase().includes(needle));
  }, [query, tagSummaries]);
  const selectedVisibleTags = visibleSummaries.filter((summary) => selectedTags.has(summary.tag)).map((summary) => summary.tag);

  function toggleTag(tag) {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function selectVisibleTags() {
    setSelectedTags((current) => {
      const next = new Set(current);
      visibleSummaries.forEach((summary) => next.add(summary.tag));
      return next;
    });
  }

  function clearSelection() {
    setSelectedTags(new Set());
  }

  function removeSelectedTags() {
    if (!selectedVisibleTags.length) {
      return;
    }

    if (onDeleteTags) {
      onDeleteTags(selectedVisibleTags);
    } else {
      selectedVisibleTags.forEach((tag) => onDeleteTag?.(tag));
    }

    setSelectedTags((current) => {
      const next = new Set(current);
      selectedVisibleTags.forEach((tag) => next.delete(tag));
      return next;
    });
  }

  function removeTag(tag) {
    onDeleteTag?.(tag);
    setSelectedTags((current) => {
      const next = new Set(current);
      next.delete(tag);
      return next;
    });
  }

  function startRename(tag) {
    setEditingTag(tag);
    setRenameValue(tag);
  }

  function cancelRename() {
    setEditingTag('');
    setRenameValue('');
  }

  function saveRename(tag) {
    const cleanValue = normalizeTagCode(renameValue);
    if (cleanValue && cleanValue !== tag) {
      onRenameTag?.(tag, renameValue);
      setSelectedTags((current) => {
        const next = new Set(current);
        next.delete(tag);
        return next;
      });
    }
    cancelRename();
  }

  function updatePrefix(categoryId, prefix) {
    setPrefixDrafts((current) => ({
      ...current,
      [categoryId]: prefix
    }));
    onUpdateTagPrefix?.(categoryId, prefix);
  }

  return (
    <section className="tag-manager">
      {showHeader ? (
        <div className="catalog-workspace__header tag-manager__header">
          <div className="catalog-workspace__title">
            <h2>标签管理</h2>
          </div>
          <div className="tag-manager__header-tools">
            {nextTags.length ? (
              <div className="tag-manager__suggestions" aria-label="下一号标签">
                {nextTags.map((suggestion) => (
                  <span key={suggestion.tag} className="tag-chip tag-chip--suggested">
                    {suggestion.tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {visiblePrefixEntries.length ? (
        <section className="tag-prefix-panel" aria-label="分类标签前缀">
          <div className="tag-prefix-panel__header">
            <h3>分类前缀</h3>
          </div>
          <div className="tag-prefix-panel__grid">
            {visiblePrefixEntries.map((entry) => (
              <label className="tag-prefix-rule" key={entry.id}>
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entry.path}</small>
                </span>
                <input
                  aria-label={`标签前缀 ${entry.name}`}
                  value={prefixDrafts?.[entry.id] ?? tagPrefixes?.[entry.id] ?? ''}
                  maxLength={6}
                  placeholder="YF"
                  onChange={(event) => updatePrefix(entry.id, event.target.value)}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <div className="tag-manager__controls">
        <div className="tag-manager__filter-section tag-manager__filter-section--category">
          <div className="tag-manager__filter-section-title">分类筛选</div>
          <div className="tag-manager__filter-row tag-manager__filter-row--category">
            <label className="field tag-manager__category-filter">
              <span>一级分类</span>
              <select
                aria-label="按一级分类筛选标签"
                value={categoryLevel1Filter}
                onChange={(event) => {
                  setCategoryLevel1Filter(event.target.value);
                  setCategoryLevel2Filter('');
                }}
              >
                <option value="">全部一级分类</option>
                {categoryLevel1Options.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field tag-manager__category-filter">
              <span>二级分类</span>
              <select aria-label="按二级分类筛选标签" value={categoryLevel2Filter} onChange={(event) => setCategoryLevel2Filter(event.target.value)}>
                <option value="">全部二级分类</option>
                {categoryLevel2Options.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="tag-manager__filter-section tag-manager__filter-section--location">
          <div className="tag-manager__filter-section-title">位置筛选</div>
          <div className="tag-manager__filter-row tag-manager__filter-row--location">
            <label className="field tag-manager__location-filter">
              <span>一级位置</span>
              <select
                aria-label="按一级位置筛选标签"
                value={locationLevel1Filter}
                onChange={(event) => {
                  setLocationLevel1Filter(event.target.value);
                  setLocationLevel2Filter('');
                  setLocationLevel3Filter('');
                }}
              >
                <option value="">全部一级位置</option>
                {locationLevel1Options.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field tag-manager__location-filter">
              <span>二级位置</span>
              <select
                aria-label="按二级位置筛选标签"
                value={locationLevel2Filter}
                onChange={(event) => {
                  setLocationLevel2Filter(event.target.value);
                  setLocationLevel3Filter('');
                }}
              >
                <option value="">全部二级位置</option>
                {locationLevel2Options.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field tag-manager__location-filter">
              <span>三级位置</span>
              <select aria-label="按三级位置筛选标签" value={locationLevel3Filter} onChange={(event) => setLocationLevel3Filter(event.target.value)}>
                <option value="">全部三级位置</option>
                {locationLevel3Options.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="tag-manager__filter-row tag-manager__filter-row--search">
          <label className="field tag-manager__search">
            <span>搜索标签</span>
            <input aria-label="搜索标签" value={query} placeholder="输入标签或物品名" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="tag-manager__bulk-bar">
            <span>已选 {selectedVisibleTags.length} 个</span>
            <button className="secondary-button" type="button" disabled={!visibleSummaries.length} onClick={selectVisibleTags}>
              全选当前
            </button>
            <button className="ghost-button" type="button" disabled={!selectedTags.size} onClick={clearSelection}>
              清空选择
            </button>
            <button className="ghost-button danger-button" type="button" disabled={!selectedVisibleTags.length} onClick={removeSelectedTags}>
              删除选中
            </button>
          </div>
        </div>
      </div>

      <div className="tag-manager__list" aria-label="已使用标签">
        {visibleSummaries.length ? (
          visibleSummaries.map((summary) => (
            <div className={`tag-manager__row ${selectedTags.has(summary.tag) ? 'is-selected' : ''}`} key={summary.tag}>
              <label className="tag-manager__summary">
                <input
                  type="checkbox"
                  aria-label={`选择标签 ${summary.tag}`}
                  checked={selectedTags.has(summary.tag)}
                  onChange={() => toggleTag(summary.tag)}
                />
                <span>
                  <strong>{summary.tag}</strong>
                  <small>{summary.count} 个物品</small>
                </span>
              </label>

              {editingTag === summary.tag ? (
                <div className="tag-manager__rename">
                  <input
                    aria-label={`新标签名称 ${summary.tag}`}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        saveRename(summary.tag);
                      }
                      if (event.key === 'Escape') {
                        cancelRename();
                      }
                    }}
                  />
                  <button className="secondary-button" type="button" aria-label={`保存标签 ${summary.tag}`} onClick={() => saveRename(summary.tag)}>
                    保存
                  </button>
                  <button className="ghost-button" type="button" aria-label={`取消改名 ${summary.tag}`} onClick={cancelRename}>
                    取消
                  </button>
                </div>
              ) : (
                <div className="tag-manager__actions">
                  <button className="ghost-button" type="button" aria-label={`改名标签 ${summary.tag}`} onClick={() => startRename(summary.tag)}>
                    改名
                  </button>
                  <button className="ghost-button danger-button" type="button" aria-label={`删除标签 ${summary.tag}`} onClick={() => removeTag(summary.tag)}>
                    删除
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <strong className="tag-manager__empty-text">{tagSummaries.length ? '没有找到标签' : '暂无标签'}</strong>
        )}
      </div>
    </section>
  );
}

function buildLevelOptions(entries, level, parentId = '') {
  return entries
    .filter((entry) => entry.level === level && (!parentId || entry.parentId === parentId))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function buildPrefixEntries(categories = []) {
  return categories
    .map((category) => {
      const lineage = getNodeLineage(categories, category.id);
      const path = lineage.map((node) => node.name).filter(Boolean).join(' / ');

      return {
        id: category.id,
        name: category.name,
        path,
        level: Number(category.level) || 1
      };
    })
    .sort((left, right) => left.level - right.level || left.path.localeCompare(right.path, 'zh-CN'));
}

function areSameRecord(left = {}, right = {}) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});

  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value]) => right[key] === value);
}
