import { describe, expect, it } from 'vitest';
import { normalizeItemDetail } from '../../src/renderer/features/items/item-detail-text';
import { buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';

describe('specification and style separators', () => {
  it.each([['A B', 'A·B'], ['白色　S', '白色·S'], ['  印花 　镂空  ', '印花·镂空'], ['A · B', 'A·B'], ['白色·S', '白色·S'], ['　 ', ''], [null, '']])('formats %j as %j', (input, expected) => {
    expect(normalizeItemDetail(input)).toBe(expected);
    expect(normalizeItemDetail(expected)).toBe(expected);
  });
  it('formats legacy card fields without changing stored values or other fields', () => {
    const item = { name: 'T 恤', brand: 'Some Brand', notes: '白色 S', specification: '印花　镂空', quantity: '1个' };
    const card = buildItemCardView(item);
    expect(card.title).toBe('T 恤');
    expect(card.note).toBe('白色·S');
    expect(card.metaLine).toBe('Some Brand · 印花·镂空 · 1个');
    expect(card.notes).toBe('白色 S');
    expect(card.specification).toBe('印花　镂空');
    expect(item.notes).toBe('白色 S');
  });
});
