import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TagManager from '../../src/renderer/features/tags/TagManager';

const categories = [
  { id: 'cat_clothes', name: '服装', level: 1, parentId: null },
  { id: 'cat_shoes', name: '鞋子', level: 2, parentId: 'cat_clothes' },
  { id: 'cat_coat', name: '外套', level: 2, parentId: 'cat_clothes' },
  { id: 'cat_digital', name: '数码', level: 1, parentId: null },
  { id: 'cat_storage', name: '存储', level: 2, parentId: 'cat_digital' }
];

describe('TagManager filtered prefix panel', () => {
  it('only shows category prefix inputs after using the category filter', async () => {
    const user = userEvent.setup();

    render(<TagManager categories={categories} tagPrefixes={{ cat_clothes: 'YF', cat_shoes: 'XZ', cat_digital: 'SM' }} onUpdateTagPrefix={vi.fn()} />);

    expect(screen.queryByText('已贴过的标签会在这里汇总。')).not.toBeInTheDocument();
    expect(screen.queryByText('先筛选分类')).not.toBeInTheDocument();
    expect(screen.queryByText('先选择分类，再设置对应前缀')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('标签前缀 服装')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('标签前缀 数码')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('按一级分类筛选标签'), 'cat_clothes');

    expect(screen.getByLabelText('标签前缀 服装')).toBeInTheDocument();
    expect(screen.getByLabelText('标签前缀 鞋子')).toBeInTheDocument();
    expect(screen.getByLabelText('标签前缀 外套')).toBeInTheDocument();
    expect(screen.queryByLabelText('标签前缀 数码')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('按二级分类筛选标签'), 'cat_shoes');

    expect(screen.queryByLabelText('标签前缀 服装')).not.toBeInTheDocument();
    expect(screen.getByLabelText('标签前缀 鞋子')).toBeInTheDocument();
    expect(screen.queryByLabelText('标签前缀 外套')).not.toBeInTheDocument();
  });

  it('renders an unboxed empty tag state', () => {
    render(<TagManager categories={categories} />);

    const list = screen.getByLabelText('已使用标签');
    expect(within(list).getByText('暂无标签')).toHaveClass('tag-manager__empty-text');
    expect(list.querySelector('.tag-manager__empty')).toBeNull();
  });
});
