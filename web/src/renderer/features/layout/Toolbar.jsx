export default function Toolbar({
  selectedSection,
  selectedCatalogMode,
  search = '',
  contextActions = null,
  onSelectSection,
  onSetCatalogMode,
  onSearch,
  onBrandClick,
  onBackToItems,
  onSaveProject
}) {
  const contextualMode = selectedSection === 'catalog';

  function openCatalogMode(mode) {
    onSelectSection?.('catalog');
    onSetCatalogMode?.(mode);
  }

  return (
    <header className={`app-toolbar ${contextualMode ? 'app-toolbar--context' : ''}`}>
      <div className="toolbar-brand">
        {onBrandClick ? (
          <button className="brand-badge brand-badge--sidebar-width" type="button" onClick={onBrandClick}>物品管理</button>
        ) : (
          <div className="brand-badge brand-badge--sidebar-width" aria-hidden="true">物品管理</div>
        )}
      </div>

      <label className="toolbar-search toolbar-search--between-sides" aria-label="搜索物品">
        <input value={search} onChange={(event) => onSearch?.(event.target.value)} placeholder="搜索名称、规格、款式、品牌" />
      </label>

      {contextualMode ? (
        <>
          <div className="toolbar-context" aria-label="当前页面操作">
            {contextActions}
          </div>
          <div className="toolbar-return-slot">
            <button className="secondary-button toolbar-button--uniform toolbar-return-button" type="button" onClick={() => onBackToItems?.()}>
              返回
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="toolbar-nav" aria-label="主导航">
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${selectedSection === 'items' ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSelectSection?.('items')}
            >
              物品
            </button>
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${
                selectedSection === 'catalog' && selectedCatalogMode === 'category' ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => openCatalogMode('category')}
            >
              分类
            </button>
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${
                selectedSection === 'catalog' && selectedCatalogMode === 'location' ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => openCatalogMode('location')}
            >
              位置
            </button>
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${
                selectedSection === 'catalog' && selectedCatalogMode === 'tag' ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => openCatalogMode('tag')}
            >
              标签
            </button>
          </nav>

          <div className="toolbar-actions" />

          <div className="toolbar-save-slot">
            <button className="primary-button toolbar-button--uniform" type="button" onClick={onSaveProject} aria-label="保存项目">
              保存
            </button>
          </div>
        </>
      )}
    </header>
  );
}
