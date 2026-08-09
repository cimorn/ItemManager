export default function ItemGalleryCard({ item, bulkMode = false, bulkSelected = false, onClick }) {
  const className = ['item-gallery-card', bulkSelected ? 'is-bulk-selected' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={item.title}
      aria-pressed={bulkMode ? bulkSelected : undefined}
    >
      {bulkMode ? <span className="item-gallery-card__select-mark">{bulkSelected ? '已选' : '选择'}</span> : null}
      <div className="item-gallery-card__image-shell">
        {item.imageSrc ? (
          <img className="item-gallery-card__image" src={item.imageSrc} alt={item.title} loading="lazy" />
        ) : (
          <div className="item-gallery-card__image item-gallery-card__image--placeholder" aria-label={`${item.title} 占位图`}>
            无图
          </div>
        )}
      </div>

      <div className="item-gallery-card__content">
        <div className="item-gallery-card__title-row">
          <strong>{item.title}</strong>
          {item.note ? <span className="item-gallery-card__note">{item.note}</span> : null}
        </div>
        <div className="item-gallery-card__meta-row">{item.metaLine || '未填写品牌、规格和数量'}</div>
        <div className="item-gallery-card__storage-row" aria-label={`${item.title} 存放位置和标签`}>
          <span className="item-gallery-card__location-row">{item.locationLine}</span>
          {item.tags?.length ? (
            <span className="item-gallery-card__storage-tags">
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
