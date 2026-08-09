import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CatalogWorkspace from '../../src/renderer/features/catalog/CatalogWorkspace';

const categories = [
  { id: 'cat_clothes', name: '服装', level: 1, parentId: null },
  { id: 'cat_shoes', name: '鞋子', level: 2, parentId: 'cat_clothes' }
];

describe('CatalogWorkspace create confirmation', () => {
  it('waits for confirmation before adding a catalog root', async () => {
    const user = userEvent.setup();
    const onAddRoot = vi.fn();

    render(
      <CatalogWorkspace
        mode="category"
        entries={categories}
        selectedId="cat_clothes"
        onSelect={vi.fn()}
        onAddRoot={onAddRoot}
        onAddSibling={vi.fn()}
        onAddChild={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    const directoryActions = screen.getByLabelText('分类目录操作');
    await user.click(within(directoryActions).getByRole('button', { name: '新增顶级' }));

    expect(onAddRoot).not.toHaveBeenCalled();
    expect(screen.queryByRole('treeitem', { name: '配件' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '配件');

    expect(onAddRoot).not.toHaveBeenCalled();
    expect(screen.queryByRole('treeitem', { name: '配件' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确定' }));

    expect(onAddRoot).toHaveBeenCalledWith('category', '配件');
  });
});
