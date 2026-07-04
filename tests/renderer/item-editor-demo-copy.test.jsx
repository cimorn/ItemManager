import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';

const categories = [
  { id: 'demo_cat_office', name: '办公', level: 1, parentId: null },
  { id: 'demo_cat_stationery', name: '文具', level: 2, parentId: 'demo_cat_office' }
];

const locations = [
  { id: 'demo_loc_study', name: '书房', level: 1, parentId: null },
  { id: 'demo_loc_shelf', name: '书架', level: 2, parentId: 'demo_loc_study' }
];

describe('ItemEditorModal demo copy', () => {
  it('uses neutral quick-fill examples instead of private sample data', () => {
    render(
      <ItemEditorModal
        open
        item={{
          id: 'demo_item_label_printer',
          name: '标签机',
          brand: 'Demo',
          specification: 'D30',
          quantity: '1台',
          categoryId: 'demo_cat_stationery',
          locationId: 'demo_loc_shelf',
          tags: ['BG-001']
        }}
        categories={categories}
        locations={locations}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const quickFill = screen.getByPlaceholderText('标签机 | 演示 | Demo | D30 | 1台 | 办公/文具 | 书房/书架 | BG-001');
    expect(quickFill).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/板鞋|Champion/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('例如：BG-001、GJ-003、SN-002')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/YF-001|SM-023|XZ-105/)).not.toBeInTheDocument();
  });
});
