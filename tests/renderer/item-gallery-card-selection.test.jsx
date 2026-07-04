import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ItemGalleryGrid from '../../src/renderer/features/items/ItemGalleryGrid';

const items = [
  {
    id: 'item_1',
    title: '板鞋',
    metaLine: 'Champion · 44码 · 1双',
    locationLine: '日常',
    tags: [],
    imageSrc: ''
  }
];

describe('ItemGalleryGrid card selection style', () => {
  it('does not show a persistent selected effect after clicking an item', () => {
    render(<ItemGalleryGrid items={items} selectedItemId="item_1" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: '板鞋' })).not.toHaveClass('is-selected');
  });
});
