import ItemGalleryCard from './ItemGalleryCard';

export default function ItemGalleryGrid({ items, bulkMode = false, bulkSelectedIds = new Set(), onSelect }) {
  if (!items.length) {
    return (
      <div className="item-gallery-empty">
        <p>没有匹配物品</p>
        <span>换个筛选，或者直接新增。</span>
      </div>
    );
  }

  return (
    <div className="item-gallery-grid item-gallery-grid--showcase">
      {items.map((item) => (
        <ItemGalleryCard
          key={item.id}
          item={item}
          bulkMode={bulkMode}
          bulkSelected={bulkSelectedIds.has(item.id)}
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}
