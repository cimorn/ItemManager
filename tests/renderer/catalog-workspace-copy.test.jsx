import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CatalogWorkspace from '../../src/renderer/features/catalog/CatalogWorkspace';

const categories = [
  { id: 'cat_clothes', name: '服装', level: 1, parentId: null },
  { id: 'cat_shoes', name: '鞋子', level: 2, parentId: 'cat_clothes' }
];

const locations = [
  { id: 'loc_home', name: '日常', level: 1, parentId: null },
  { id: 'loc_box', name: '鞋柜', level: 2, parentId: 'loc_home' }
];

function renderWorkspace(mode, entries) {
  return render(
    <CatalogWorkspace
      mode={mode}
      entries={entries}
      selectedId={entries[0]?.id}
      onSelect={vi.fn()}
      onAddRoot={vi.fn()}
      onAddSibling={vi.fn()}
      onAddChild={vi.fn()}
      onDelete={vi.fn()}
      onUpdate={vi.fn()}
    />
  );
}

describe('CatalogWorkspace header copy', () => {
  it('does not render explanatory copy under category and location titles', () => {
    const { rerender } = renderWorkspace('category', categories);

    expect(screen.getByRole('heading', { name: '分类' })).toBeInTheDocument();
    expect(screen.queryByText('分类固定两级，用树状结构管理主分类和子分类。')).not.toBeInTheDocument();

    rerender(
      <CatalogWorkspace
        mode="location"
        entries={locations}
        selectedId="loc_home"
        onSelect={vi.fn()}
        onAddRoot={vi.fn()}
        onAddSibling={vi.fn()}
        onAddChild={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '位置' })).toBeInTheDocument();
    expect(screen.queryByText('位置支持三级，适合管理房间、柜体和盒子。')).not.toBeInTheDocument();
  });
});
