function FilterChipGroup({ chips, activeId, onSelect, allowAll = false, allLabel = '全部' }) {
  if (!chips.length && !allowAll) {
    return null;
  }

  return (
    <div className="item-filter-group">
      <div className="item-filter-group__chips">
        {allowAll ? (
          <button
            type="button"
            className={`filter-chip ${!activeId ? 'is-active' : ''}`}
            onClick={() => onSelect('')}
          >
            {allLabel}
          </button>
        ) : null}
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`filter-chip ${activeId === chip.id ? 'is-active' : ''}`}
            onClick={() => onSelect(activeId === chip.id ? '' : chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategorySelectGroup({ mainCategories, subCategories, filters, onChange }) {
  return (
    <div className="item-category-filter" role="group" aria-label="分类筛选">
      <div className="item-category-filter__selects">
        <label className="item-category-filter__field">
          <select aria-label="一级分类筛选" value={filters.mainCategoryId || ''} onChange={(event) => onChange({ mainCategoryId: event.target.value, subCategoryId: '' })}>
            <option value="">分类</option>
            {mainCategories.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="item-category-filter__field">
          <select aria-label="二级分类筛选" value={filters.subCategoryId || ''} disabled={!filters.mainCategoryId || !subCategories.length} onChange={(event) => onChange({ subCategoryId: event.target.value === '__all__' ? '' : event.target.value })}>
            <option value="" disabled>二级分类</option>
            {subCategories.length ? <option value="__all__">全部</option> : null}
            {subCategories.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

function LocationSelectGroup({ levels, selection, onChange }) {
  const allOptionValue = '__all__';
  const normalizeSelectedLocation = (locationId) => (locationId === allOptionValue ? '' : locationId);

  function selectLevel1(locationId) {
    onChange({ locationId: normalizeSelectedLocation(locationId) });
  }

  function selectLevel2(locationId) {
    const selectedLocationId = normalizeSelectedLocation(locationId);
    onChange({ locationId: selectedLocationId || selection.level1Id || '' });
  }

  function selectLevel3(locationId) {
    const selectedLocationId = normalizeSelectedLocation(locationId);
    onChange({ locationId: selectedLocationId || selection.level2Id || selection.level1Id || '' });
  }

  return (
    <div className="item-location-filter" role="group" aria-label="位置筛选">
      <div className="item-location-filter__selects">
      <label className="item-location-filter__field">
        <select aria-label="一级位置筛选" value={selection.level1Id} onChange={(event) => selectLevel1(event.target.value)}>
          <option value="">位置</option>
          {levels.level1.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="item-location-filter__field">
        <select
          aria-label="二级位置筛选"
          value={selection.level2Id}
          onChange={(event) => selectLevel2(event.target.value)}
          disabled={!selection.level1Id || !levels.level2.length}
        >
          <option value="" disabled>
            二级位置
          </option>
          {levels.level2.length ? <option value={allOptionValue}>全部</option> : null}
          {levels.level2.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="item-location-filter__field">
        <select
          aria-label="三级位置筛选"
          value={selection.level3Id}
          onChange={(event) => selectLevel3(event.target.value)}
          disabled={!selection.level2Id || !levels.level3.length}
        >
          <option value="" disabled>
            三级位置
          </option>
          {levels.level3.length ? <option value={allOptionValue}>全部</option> : null}
          {levels.level3.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      </div>
    </div>
  );
}

export default function ItemFilterChips({ groups, filters, onChange, className = '' }) {
  const stripClassName = ['items-filter-strip', className].filter(Boolean).join(' ');

  return (
    <div className={stripClassName}>
      <div className="item-hierarchy-filters" role="group" aria-label="分类和位置筛选">
        <CategorySelectGroup mainCategories={groups.mainCategories} subCategories={groups.subCategories} filters={filters} onChange={onChange} />
        <LocationSelectGroup levels={groups.locationLevels} selection={groups.locationSelection} onChange={onChange} />
      </div>
      {groups.tagChips.length ? (
        <FilterChipGroup
          chips={groups.tagChips}
          activeId={filters.tag}
          onSelect={(tag) =>
            onChange({
              tag
            })
          }
        />
      ) : null}
    </div>
  );
}
