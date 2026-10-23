import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';

describe('ItemGalleryCard tags', () => {
  it('keeps packaging in the third row as an accessible icon only when true', () => {
    const { container, rerender } = render(<ItemGalleryCard item={{ title: '相机', note: '长备注', metaLine: '品牌 · 规格', locationLine: '书房', tags: ['标签'], isPackaged: true }} />);
    const marker = screen.getByRole('img', { name: '有包装' });
    const storageRow = screen.getByLabelText('相机 存放位置和标签');
    expect(marker.tagName.toLowerCase()).toBe('svg');
    expect(within(marker).getByTitle('有包装')).toBeInTheDocument();
    expect(storageRow.lastElementChild).toBe(marker);
    expect(container.querySelector('.item-gallery-card__content').children).toHaveLength(3);
    for (const flag of [false, undefined, 'true', 1]) {
      rerender(<ItemGalleryCard item={{ title: '相机', isPackaged: flag }} />);
      expect(screen.queryByRole('img', { name: '有包装' })).not.toBeInTheDocument();
    }
  });
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
