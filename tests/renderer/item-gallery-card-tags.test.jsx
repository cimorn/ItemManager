import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';

describe('ItemGalleryCard tags', () => {
  it('shows item tags to the right of the location row', () => {
    render(
      <ItemGalleryCard
        item={{
          id: 'demo_item',
          title: '标签机',
          metaLine: 'Demo · D30 · 1台',
          locationLine: '书房 · 书架',
          tags: ['BG-001', 'BG-002'],
          imageSrc: ''
        }}
      />
    );

    const storageRow = screen.getByLabelText('标签机 存放位置和标签');
    expect(within(storageRow).getByText('书房 · 书架')).toHaveClass('item-gallery-card__location-row');
    expect(within(storageRow).getByText('BG-001').closest('.item-gallery-card__storage-tags')).not.toBeNull();
    expect(within(storageRow).getByText('BG-002').closest('.item-gallery-card__storage-tags')).not.toBeNull();
    expect(storageRow.lastElementChild).toHaveClass('item-gallery-card__storage-tags');
  });
});
