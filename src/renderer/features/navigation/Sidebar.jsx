import { getChildEntries } from '../../lib/project-data';

export default function Sidebar({ categories = [], activeMainCategoryId = '', onSelectMainCategory }) {
  const mainCategories = getChildEntries(categories, null);

  return (
    <aside className="app-sidebar app-sidebar--categories">
      <nav className="category-sidebar" aria-label="分类导航">
        <button
          className={`category-sidebar__item ${!activeMainCategoryId ? 'is-active' : ''}`}
          type="button"
          onClick={() => onSelectMainCategory?.('')}
        >
          全部
        </button>
        {mainCategories.map((category) => (
          <button
            key={category.id}
            className={`category-sidebar__item ${activeMainCategoryId === category.id ? 'is-active' : ''}`}
            type="button"
            onClick={() => onSelectMainCategory?.(category.id)}
          >
            {category.name}
          </button>
        ))}
      </nav>
    </aside>
  );
}
