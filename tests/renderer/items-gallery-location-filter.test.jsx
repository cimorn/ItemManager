import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ItemsGalleryPage from '../../src/renderer/features/items/ItemsGalleryPage';

const categories = [
  { id: 'cat_digital', name: '数码', level: 1, parentId: null },
  { id: 'cat_storage', name: '存储', level: 2, parentId: 'cat_digital' },
  { id: 'cat_device', name: '设备', level: 2, parentId: 'cat_digital' }
];

const locations = [
  { id: 'loc_325', name: '325', level: 1, parentId: null },
  { id: 'loc_desk', name: '桌下', level: 2, parentId: 'loc_325' },
  { id: 'loc_box', name: '收纳盒', level: 3, parentId: 'loc_desk' },
  { id: 'loc_daily', name: '日常', level: 1, parentId: null }
];

const items = [
  { id: 'item_1', name: 'NAS', categoryId: 'cat_storage', locationId: 'loc_desk', tags: [] }
];

describe('ItemsGalleryPage location filters', () => {
  it('renders location filters as cascading selects instead of chips', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();

    const { container, rerender } = render(
      <ItemsGalleryPage
        allItems={items}
        items={items}
        categories={categories}
        locations={locations}
        filters={{ mainCategoryId: 'cat_digital', subCategoryId: '', locationId: '', tag: '' }}
        onFilterChange={onFilterChange}
      />
    );

    const level1Select = screen.getByLabelText('一级位置筛选');
    expect(level1Select).toBeInTheDocument();
    expect(level1Select.selectedOptions[0].textContent).toBe('全部');
    expect(within(level1Select).getByRole('option', { name: '全部' })).toBeInTheDocument();
    expect(screen.getByLabelText('二级位置筛选').selectedOptions[0].textContent).toBe('二级位置');
    expect(screen.getByLabelText('三级位置筛选').selectedOptions[0].textContent).toBe('三级位置');
    expect(container.querySelectorAll('.item-location-filter__field span')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '存储' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '设备' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '325' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '日常' })).not.toBeInTheDocument();

    await user.selectOptions(level1Select, 'loc_325');
    expect(onFilterChange).toHaveBeenLastCalledWith({ locationId: 'loc_325' });

    rerender(
      <ItemsGalleryPage
        allItems={items}
        items={items}
        categories={categories}
        locations={locations}
        filters={{ mainCategoryId: 'cat_digital', subCategoryId: '', locationId: 'loc_325', tag: '' }}
        onFilterChange={onFilterChange}
      />
    );

    const level2Select = screen.getByLabelText('二级位置筛选');
    expect(level2Select.selectedOptions[0].textContent).toBe('二级位置');
    expect(within(level2Select).getByRole('option', { name: '全部' })).toBeInTheDocument();

    await user.selectOptions(level2Select, 'loc_desk');
    expect(onFilterChange).toHaveBeenLastCalledWith({ locationId: 'loc_desk' });

    rerender(
      <ItemsGalleryPage
        allItems={items}
        items={items}
        categories={categories}
        locations={locations}
        filters={{ mainCategoryId: 'cat_digital', subCategoryId: '', locationId: 'loc_desk', tag: '' }}
        onFilterChange={onFilterChange}
      />
    );

    const level3Select = screen.getByLabelText('三级位置筛选');
    expect(level3Select.selectedOptions[0].textContent).toBe('三级位置');
    expect(within(level3Select).getByRole('option', { name: '全部' })).toBeInTheDocument();

    await user.selectOptions(level3Select, 'loc_box');
    expect(onFilterChange).toHaveBeenLastCalledWith({ locationId: 'loc_box' });
  });
});
