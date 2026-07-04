import { useEffect, useMemo, useState } from 'react';

import {
  completeSmartTagInput,
  getChildEntries,
  getNextTagSuggestions,
  getNodeLineage,
  getTagPrefixForCategory,
  normalizeTagCodes
} from '../../lib/project-data';
import { buildPreviewSrc, createEmptyItemDraft } from './item-gallery-selectors';

function normalizeItem(item, categories, locations) {
  if (item) {
    return {
      id: item.id,
      barcode: item.barcode || item.code || '',
      code: item.barcode || item.code || '',
      name: item.name || '',
      notes: item.notes || '',
      brand: item.brand || '',
      specification: item.specification || '',
      quantity: item.quantity || '',
      categoryId: item.categoryId || '',
      locationId: item.locationId || '',
      imagePath: item.imagePath || '',
      tags: normalizeTagCodes(item.tags)
    };
  }

  return createEmptyItemDraft(categories, locations);
}

function buildCategorySelection(categories, categoryId) {
  const lineage = getNodeLineage(categories, categoryId);

  return {
    mainCategoryId: lineage[0]?.id || '',
    subCategoryId: lineage[1]?.id || ''
  };
}

function buildLocationSelection(locations, locationId) {
  const lineage = getNodeLineage(locations, locationId);

  return {
    level1Id: lineage[0]?.id || '',
    level2Id: lineage[1]?.id || '',
    level3Id: lineage[2]?.id || ''
  };
}

function compactText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/\\>›·,，;；|｜-]+/g, '');
}

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function readDelimitedQuickFill(rawText) {
  if (!/[|｜]/.test(rawText)) {
    return null;
  }

  const [name, notes, brand, specification, quantity, categoryText, locationText, tagsText] = rawText
    .split(/[|｜]/g)
    .map((part) => part.trim());

  return {
    name,
    notes,
    brand,
    specification,
    quantity,
    categoryText,
    locationText,
    tagsText
  };
}

function buildNodeChoices(entries) {
  return entries
    .map((entry) => {
      const lineage = getNodeLineage(entries, entry.id);
      const path = lineage.map((node) => node.name).filter(Boolean).join('/');

      return {
        id: entry.id,
        name: entry.name,
        names: lineage.map((node) => node.name).filter(Boolean),
        searchKeys: [path, entry.name].map(compactText).filter(Boolean)
      };
    })
    .filter((choice) => choice.searchKeys.length)
    .sort((left, right) => Math.max(...right.searchKeys.map((key) => key.length)) - Math.max(...left.searchKeys.map((key) => key.length)));
}

function findNodeFromText(sourceText, entries) {
  const haystack = compactText(sourceText);

  if (!haystack) {
    return null;
  }

  return buildNodeChoices(entries).find((choice) => choice.searchKeys.some((key) => haystack.includes(key))) || null;
}

function readKeyedQuickFill(rawText) {
  const aliasToField = {
    条码: 'barcode',
    码号: 'barcode',
    名称: 'name',
    名字: 'name',
    品名: 'name',
    物品: 'name',
    品牌: 'brand',
    规格: 'specification',
    型号: 'specification',
    数量: 'quantity',
    备注: 'notes',
    说明: 'notes',
    图片: 'imagePath',
    分类: 'categoryText',
    位置: 'locationText',
    地点: 'locationText',
    标签: 'tagsText',
    标记: 'tagsText'
  };
  const keyPattern = /(条码|码号|名称|名字|品名|物品|品牌|规格|型号|数量|备注|说明|图片|分类|位置|地点|标签|标记)\s*[:：=]\s*/g;
  const matches = [...rawText.matchAll(keyPattern)];

  if (!matches.length) {
    return null;
  }

  return matches.reduce((result, match, index) => {
    const field = aliasToField[match[1]];
    const valueStart = match.index + match[0].length;
    const valueEnd = matches[index + 1]?.index ?? rawText.length;
    const value = rawText.slice(valueStart, valueEnd).replace(/[;；|｜]+$/g, '').trim();

    if (field && value) {
      result[field] = value;
    }

    return result;
  }, {});
}

function parseQuickFill(rawText, categories, locations) {
  const raw = String(rawText || '').trim();

  if (!raw) {
    return {};
  }

  const keyed = readKeyedQuickFill(raw) || {};
  const delimited = Object.keys(keyed).length ? null : readDelimitedQuickFill(raw);
  const source = {
    ...(delimited || {}),
    ...keyed
  };
  const categoryMatch = findNodeFromText(source.categoryText || raw, categories);
  const locationMatch = findNodeFromText(source.locationText || raw, locations);
  const patch = {
    barcode: source.barcode,
    code: source.barcode,
    name: source.name,
    notes: source.notes,
    brand: source.brand,
    specification: source.specification,
    quantity: source.quantity,
    imagePath: source.imagePath,
    tags: source.tagsText ? normalizeTagCodes(source.tagsText) : undefined,
    categoryId: categoryMatch?.id,
    locationId: locationMatch?.id
  };

  if (!delimited && !keyed.name && !keyed.brand && !keyed.specification && !keyed.quantity && !keyed.notes) {
    const reserved = new Set([
      ...(categoryMatch?.names || []),
      ...(locationMatch?.names || [])
    ].map(compactText));
    const tokens = raw
      .replace(/[，,;；|｜\t\r\n]+/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token && !reserved.has(compactText(token)));

    patch.name = tokens[0];
    patch.notes = tokens[1];
    patch.brand = tokens[2];
    patch.specification = tokens[3];
    patch.quantity = tokens[4];
    patch.tags = tokens[5] ? normalizeTagCodes(tokens.slice(5).join('|')) : undefined;
  }

  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value));
}

export default function ItemEditorModal({
  open,
  mode = 'edit',
  item = null,
  categories = [],
  locations = [],
  availableTags = [],
  tagPrefixes = {},
  projectDir = '',
  onSave,
  onClose,
  onDelete,
  onImportImage
}) {
  const [draft, setDraft] = useState(() => normalizeItem(item, categories, locations));
  const [dirtyDraft, setDirtyDraft] = useState(false);
  const [quickFill, setQuickFill] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [quickFillFeedback, setQuickFillFeedback] = useState('');
  const [importing, setImporting] = useState(false);
  const [imageRotation, setImageRotation] = useState(0);
  const [imageFeedback, setImageFeedback] = useState({ type: '', message: '' });
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(normalizeItem(item, categories, locations));
    setDirtyDraft(false);
    setQuickFill('');
    setTagInput('');
    setQuickFillFeedback('');
    setImageRotation(0);
    setImageFeedback({ type: '', message: '' });
    setPreviewFailed(false);
  }, [open, item, categories, locations]);

  useEffect(() => {
    setPreviewFailed(false);
  }, [draft.imagePath, projectDir]);

  const categorySelection = useMemo(
    () => buildCategorySelection(categories, draft.categoryId),
    [categories, draft.categoryId]
  );
  const locationSelection = useMemo(
    () => buildLocationSelection(locations, draft.locationId),
    [locations, draft.locationId]
  );
  const mainCategoryOptions = useMemo(() => getChildEntries(categories, null), [categories]);
  const subCategoryOptions = useMemo(
    () => (categorySelection.mainCategoryId ? getChildEntries(categories, categorySelection.mainCategoryId) : []),
    [categories, categorySelection.mainCategoryId]
  );
  const level1Options = useMemo(() => getChildEntries(locations, null), [locations]);
  const level2Options = useMemo(
    () => (locationSelection.level1Id ? getChildEntries(locations, locationSelection.level1Id) : []),
    [locations, locationSelection.level1Id]
  );
  const level3Options = useMemo(
    () => (locationSelection.level2Id ? getChildEntries(locations, locationSelection.level2Id) : []),
    [locations, locationSelection.level2Id]
  );
  const tagSuggestions = useMemo(
    () =>
      getNextTagSuggestions(
        [...normalizeTagCodes(availableTags), ...normalizeTagCodes(draft.tags)],
        4,
        getTagPrefixForCategory(draft.categoryId, categories, tagPrefixes)
      ),
    [availableTags, categories, draft.categoryId, draft.tags, tagPrefixes]
  );
  const previewSrc = useMemo(() => buildPreviewSrc(projectDir, draft.imagePath), [draft.imagePath, projectDir]);

  if (!open) {
    return null;
  }

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirtyDraft(true);
  }

  function updateDraftTags(tags) {
    updateDraft({ tags: normalizeTagCodes(tags) });
  }

  function addDraftTag(tag) {
    const cleanTag = completeSmartTagInput(tag, [...normalizeTagCodes(availableTags), ...normalizeTagCodes(draft.tags)]);
    if (!cleanTag) {
      return;
    }

    updateDraftTags([...(draft.tags || []), cleanTag]);
    setTagInput('');
  }

  function removeDraftTag(tag) {
    updateDraftTags((draft.tags || []).filter((item) => item !== tag));
  }

  function handleTagInputKeyDown(event) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    addDraftTag(tagInput);
  }

  function handleMainCategoryChange(value) {
    updateDraft({
      categoryId: value || ''
    });
  }

  function handleSubCategoryChange(value) {
    updateDraft({
      categoryId: value || categorySelection.mainCategoryId || ''
    });
  }

  function handleLevel1Change(value) {
    updateDraft({
      locationId: value || ''
    });
  }

  function handleLevel2Change(value) {
    updateDraft({
      locationId: value || locationSelection.level1Id || ''
    });
  }

  function handleLevel3Change(value) {
    updateDraft({
      locationId: value || locationSelection.level2Id || locationSelection.level1Id || ''
    });
  }

  function handleApplyQuickFill() {
    const patch = parseQuickFill(quickFill, categories, locations);

    if (!Object.keys(patch).length) {
      setQuickFillFeedback('没有可套用的内容');
      return;
    }

    updateDraft(patch);
    setQuickFillFeedback('已套用');
  }

  async function handleImportImage() {
    if (!onImportImage) {
      return;
    }

    if (!draft.categoryId) {
      setImageFeedback({
        type: 'error',
        message: '请先选择主分类或子分类后再上传图片'
      });
      return;
    }

    setImporting(true);
    setImageFeedback({ type: '', message: '' });

    try {
      const result = await onImportImage({ ...item, ...draft });

      if (result?.relativePath) {
        updateDraft({ imagePath: result.relativePath });
        setPreviewFailed(false);
        setImageFeedback({
          type: 'success',
          message: `已导入：${result.relativePath}`
        });
      } else {
        setImageFeedback({
          type: 'error',
          message: '这次没有导入图片'
        });
      }
    } catch (error) {
      setImageFeedback({
        type: 'error',
        message: error?.message || '图片导入失败'
      });
    } finally {
      setImporting(false);
    }
  }

  function handleRotateImage(direction) {
    if (!previewSrc) {
      setImageFeedback({
        type: 'error',
        message: '请先选择一张图片'
      });
      return;
    }

    setImageRotation((current) => current + (direction === 'left' ? -90 : 90));
    setImageFeedback({
      type: 'success',
      message: '已旋转预览，原图未改动'
    });
  }

  function requestClose() {
    if (dirtyDraft && !window.confirm('当前物品还有未保存修改，确定关闭吗？')) {
      return;
    }

    onClose?.();
  }

  function handleSave() {
    onSave?.({
      ...item,
      ...draft,
      tags: normalizeTagCodes(draft.tags)
    });
    setDirtyDraft(false);
  }

  function handleDialogKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="dialog-backdrop item-editor-backdrop" role="presentation">
      <div
        className="dialog-card item-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="dialog-header item-editor-modal__header">
          <div>
            <p className="dialog-eyebrow">{mode === 'create' ? '新增物品' : '编辑物品'}</p>
            <h2 id="item-editor-title">{mode === 'create' ? '新增物品' : draft.name || '未命名物品'}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={requestClose} aria-label="关闭物品弹窗">
            关闭
          </button>
        </div>

        <div className="item-editor-modal__body">
          <section className="item-editor-modal__media">
            <div className="item-editor-modal__preview">
              {previewSrc && !previewFailed ? (
                <img
                  src={previewSrc}
                  alt={draft.name || '物品图片'}
                  className="item-editor-modal__preview-image"
                  style={{ transform: `rotate(${imageRotation}deg)` }}
                  onLoad={() => setPreviewFailed(false)}
                  onError={() => {
                    setPreviewFailed(true);
                    setImageFeedback((current) =>
                      current.type === 'error'
                        ? current
                        : { type: 'error', message: `图片存在，但预览失败：${draft.imagePath}` }
                    );
                  }}
                />
              ) : (
                <span>{draft.imagePath && previewFailed ? '图片预览失败' : '暂无图片预览'}</span>
              )}
            </div>
            <div className="item-editor-modal__media-actions">
              <div className="item-editor-modal__rotate-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => handleRotateImage('left')}
                  disabled={!previewSrc}
                  aria-label="向左旋转图片"
                  title="向左旋转图片"
                >
                  ↺
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => handleRotateImage('right')}
                  disabled={!previewSrc}
                  aria-label="向右旋转图片"
                  title="向右旋转图片"
                >
                  ↻
                </button>
              </div>
              <button className="secondary-button" type="button" onClick={handleImportImage} disabled={importing}>
                {importing ? '上传中...' : '选择图片'}
              </button>
              <label className="field item-editor-modal__image-path">
                <span>图片相对路径</span>
                <input
                  value={draft.imagePath}
                  onChange={(event) => updateDraft({ imagePath: event.target.value })}
                  placeholder="例如：images/数码/存储/数码-存储-260225-032940.PNG"
                />
              </label>
              {imageFeedback.message ? (
                <p className={`image-feedback ${imageFeedback.type === 'error' ? 'is-error' : 'is-success'}`}>
                  {imageFeedback.message}
                </p>
              ) : null}
            </div>
          </section>

          <section className="item-editor-modal__form">
            <div className="quick-fill-panel">
              <label className="field quick-fill-field">
                <span>快速填写</span>
                <textarea
                  rows={2}
                  value={quickFill}
                  onChange={(event) => {
                    setQuickFill(event.target.value);
                    setQuickFillFeedback('');
                  }}
                  placeholder="标签机 | 演示 | Demo | D30 | 1台 | 办公/文具 | 书房/书架 | BG-001"
                />
              </label>
              <p className="quick-fill-hint">顺序：名称 | 备注 | 品牌 | 规格 | 数量 | 分类 | 位置 | 标签</p>
              <div className="quick-fill-actions">
                <button className="secondary-button" type="button" onClick={handleApplyQuickFill} disabled={!quickFill.trim()}>
                  套用
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setQuickFill('');
                    setQuickFillFeedback('');
                  }}
                >
                  清空
                </button>
                {quickFillFeedback ? <span className="quick-fill-feedback">{quickFillFeedback}</span> : null}
              </div>
            </div>

            <section className="tag-editor-panel tag-editor-panel--compact" aria-label="物品标签">
              <div className="tag-editor-panel__header">
                <span>标签</span>
              </div>
              <div className="tag-editor-panel__selected" aria-label="已选标签">
                {normalizeTagCodes(draft.tags).length ? (
                  normalizeTagCodes(draft.tags).map((tag) => (
                    <button
                      key={tag}
                      className="tag-chip tag-chip--selected"
                      type="button"
                      aria-label={`移除标签 ${tag}`}
                      onClick={() => removeDraftTag(tag)}
                    >
                      {tag}
                    </button>
                  ))
                ) : (
                  <span className="tag-editor-panel__empty">未贴标签</span>
                )}
              </div>
              <div className="tag-editor-panel__input-row">
                <label className="field">
                  <span>新增标签</span>
                  <input
                    aria-label="新增标签"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder="例如：BG-001、GJ-003、SN-002"
                  />
                </label>
                <button className="secondary-button" type="button" onClick={() => addDraftTag(tagInput)} disabled={!tagInput.trim()}>
                  添加
                </button>
              </div>
              {tagSuggestions.length ? (
                <div className="tag-editor-panel__suggestions" aria-label="推荐标签">
                  {tagSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.tag}
                      className="tag-chip tag-chip--suggested"
                      type="button"
                      aria-label={`推荐标签 ${suggestion.tag}`}
                      disabled={normalizeTagCodes(draft.tags).includes(suggestion.tag)}
                      onClick={() => addDraftTag(suggestion.tag)}
                    >
                      {suggestion.tag}
                    </button>
                  ))}
                </div>
              ) : null}
              {availableTags.length ? (
                <div className="tag-editor-panel__available" aria-label="可选标签">
                  {normalizeTagCodes(availableTags).map((tag) => (
                    <button
                      key={tag}
                      className="tag-chip"
                      type="button"
                      aria-label={`选择标签 ${tag}`}
                      disabled={normalizeTagCodes(draft.tags).includes(tag)}
                      onClick={() => addDraftTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <div className="form-row form-row--2">
              <label className="field">
                <span>名称</span>
                <input autoFocus value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
              </label>
              <label className="field">
                <span>备注</span>
                <input value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} />
              </label>
            </div>

            <div className="form-row form-row--3">
              <label className="field">
                <span>品牌</span>
                <input value={draft.brand} onChange={(event) => updateDraft({ brand: event.target.value })} />
              </label>
              <label className="field">
                <span>规格</span>
                <input value={draft.specification} onChange={(event) => updateDraft({ specification: event.target.value })} />
              </label>
              <label className="field">
                <span>数量</span>
                <input value={draft.quantity} onChange={(event) => updateDraft({ quantity: event.target.value })} />
              </label>
            </div>

            <div className="form-row form-row--2">
              <label className="field">
                <span>主分类</span>
                <select value={categorySelection.mainCategoryId} onChange={(event) => handleMainCategoryChange(event.target.value)}>
                  <option value="">未选择</option>
                  {mainCategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>子分类</span>
                <select
                  value={categorySelection.subCategoryId}
                  onChange={(event) => handleSubCategoryChange(event.target.value)}
                  disabled={!subCategoryOptions.length}
                >
                  <option value="">{subCategoryOptions.length ? '未选择' : '无子分类'}</option>
                  {subCategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row form-row--3">
              <label className="field">
                <span>一级位置</span>
                <select value={locationSelection.level1Id} onChange={(event) => handleLevel1Change(event.target.value)}>
                  <option value="">未选择</option>
                  {level1Options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>二级位置</span>
                <select
                  value={locationSelection.level2Id}
                  onChange={(event) => handleLevel2Change(event.target.value)}
                  disabled={!level2Options.length}
                >
                  <option value="">{level2Options.length ? '未选择' : '无二级位置'}</option>
                  {level2Options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>三级位置</span>
                <select
                  value={locationSelection.level3Id}
                  onChange={(event) => handleLevel3Change(event.target.value)}
                  disabled={!level3Options.length}
                >
                  <option value="">{level3Options.length ? '未选择' : '无三级位置'}</option>
                  {level3Options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="dialog-actions item-editor-modal__actions">
          {mode === 'edit' ? (
            <button className="ghost-button danger-button" type="button" onClick={() => onDelete?.(item?.id)}>
              删除物品
            </button>
          ) : (
            <span />
          )}
          <div className="item-editor-modal__action-group">
            <button className="ghost-button" type="button" onClick={requestClose}>
              取消
            </button>
            <button className="primary-button" type="button" onClick={handleSave}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
