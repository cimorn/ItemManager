import { useRef } from 'react';
import { useImagePreviewState } from '../web/ImageAccessContext';

export default function ItemGalleryCard({ item, bulkMode = false, bulkSelected = false, onClick }) {
  const imageTargetRef = useRef(null);
  const { url: imageSrc, status: imageStatus } = useImagePreviewState(item.imagePath, item.imageSrc, { targetRef: imageTargetRef });
  const className = ['item-gallery-card', bulkSelected ? 'is-bulk-selected' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={imageTargetRef}
      type="button"
      className={className}
      onClick={onClick}
      aria-label={item.title}
      aria-pressed={bulkMode ? bulkSelected : undefined}
    >
      {bulkMode ? <span className="item-gallery-card__select-mark">{bulkSelected ? '已选' : '选择'}</span> : null}
      <div className="item-gallery-card__image-shell">
        {imageSrc ? (
          <img className="item-gallery-card__image" src={imageSrc} alt={item.title} loading="lazy" />
        ) : (
          <div className="item-gallery-card__image item-gallery-card__image--placeholder" aria-label={`${item.title} 占位图`}>
            {imageStatus === 'none' ? '无图' : imageStatus === 'error' ? '图片加载失败' : '图片加载中…'}
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
          {item.isPackaged === true ? (
            <svg className="item-gallery-card__packaging" role="img" aria-label="有包装" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" focusable="false">
              <title>有包装</title>
              <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4" />
            </svg>
          ) : null}
        </div>
      </div>
    </button>
  );
}
