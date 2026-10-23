import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  completeSmartTagInput,
  getChildEntries,
  getItemLocationIds,
  getNextTagSuggestions,
  getNodeLineage,
  getTagPrefixForCategory,
  isItemPrivate,
  normalizeTagCodes
} from '../../lib/project-data';
import { normalizeItemDetail } from './item-detail-text';
import { createEmptyItemDraft } from './item-gallery-selectors';
import { useImageAccess } from '../web/ImageAccessContext';

function normalizeItem(item, categories, locations, mode = 'edit') {
  if (item) {
    return {
      ...(mode === 'copy' ? {} : { id: item.id }),
      barcode: item.barcode || item.code || '',
      code: item.barcode || item.code || '',
      name: item.name || '',
      notes: item.notes || '',
      brand: item.brand || '',
      specification: item.specification || '',
      quantity: item.quantity || '',
      categoryId: item.categoryId || '',
      locationId: item.locationId || '',
      locationIds: getItemLocationIds(item).length ? getItemLocationIds(item) : [''],
      imagePath: item.imagePath || '',
      isPrivate: mode === 'copy' ? isItemPrivate(item, { categories, locations }) : Boolean(item.isPrivate),
      isPackaged: Boolean(item.isPackaged),
      tags: normalizeTagCodes(item.tags)
    };
  }

  const empty = createEmptyItemDraft(categories, locations);
  return { ...empty, locationIds: [empty.locationId || ''], isPrivate: false, isPackaged: false };
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

export default function ItemEditorModal({
  open,
  mode = 'edit',
  item = null,
  categories = [],
  locations = [],
  availableTags = [],
  tagPrefixes = {},
  canManagePrivacy = true,
  onSave,
  onClose,
  onDelete,
  onCopy
}) {
  const [draft, setDraft] = useState(() => normalizeItem(item, categories, locations, mode));
  const [dirtyDraft, setDirtyDraft] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [imageFeedback, setImageFeedback] = useState({ type: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [pendingBrowserFile, setPendingBrowserFile] = useState(null);
  const stagedBrowserUploadRef = useRef(null);
  const stagedImageCopyRef = useRef(null);
  const editorGenerationRef = useRef(0);
  const browserEditorSessionRef = useRef(null);
  const imageAccess = useImageAccess();
  const fileInputRef = useRef(null);

  useLayoutEffect(() => {
    editorGenerationRef.current += 1;
    return () => { editorGenerationRef.current += 1; };
  }, [open, mode, item?.id, imageAccess]);

  useEffect(() => {
    if (!open) {
      browserEditorSessionRef.current = null;
      if (imageAccess) {
        setPendingBrowserFile(null);
        stagedBrowserUploadRef.current = null;
        stagedImageCopyRef.current = null;
      }
      return;
    }

    if (imageAccess) {
      // Project saves refresh object identities without ending the open browser draft.
      const session = browserEditorSessionRef.current;
      if (session?.access === imageAccess && session.mode === mode && session.itemId === item?.id) {
        return;
      }
      browserEditorSessionRef.current = { access: imageAccess, mode, itemId: item?.id };
    } else {
      browserEditorSessionRef.current = null;
    }
    setDraft(normalizeItem(item, categories, locations, mode));
    setDirtyDraft(false);
    setTagInput('');
    setImageFeedback({ type: '', message: '' });
    setSaving(false);
    setPendingBrowserFile(null);
    stagedBrowserUploadRef.current = null;
    stagedImageCopyRef.current = null;
  }, [open, item, categories, locations, mode, imageAccess]);

  const categorySelection = useMemo(
    () => buildCategorySelection(categories, draft.categoryId),
    [categories, draft.categoryId]
  );
  const mainCategoryOptions = useMemo(() => getChildEntries(categories, null), [categories]);
  const subCategoryOptions = useMemo(
    () => (categorySelection.mainCategoryId ? getChildEntries(categories, categorySelection.mainCategoryId) : []),
    [categories, categorySelection.mainCategoryId]
  );
  const level1Options = useMemo(() => getChildEntries(locations, null), [locations]);
  const assignedLocationIds = [...new Set(draft.locationIds.filter(Boolean))];
  const inheritedPrivate = isItemPrivate(
    { ...draft, locationIds: assignedLocationIds, isPrivate: false },
    { categories, locations }
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
  if (!open) {
    return null;
  }

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirtyDraft(true);
  }

  function handleBrowserFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || saving || !imageAccess) return;
    setPendingBrowserFile(file);
    stagedBrowserUploadRef.current = null;
    setDirtyDraft(true);
    setImageFeedback({ type: '', message: '' });
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

  function updateLocation(index, locationId) {
    const locationIds = draft.locationIds.map((id, rowIndex) => rowIndex === index ? locationId : id);
    updateDraft({ locationIds, locationId: locationIds[0] || '' });
  }

  function removeLocation(index) {
    const remaining = draft.locationIds.filter((_, rowIndex) => rowIndex !== index);
    const locationIds = remaining.length ? remaining : [''];
    updateDraft({ locationIds, locationId: locationIds[0] || '' });
  }

  function requestClose() {
    if (saving) return;
    if (dirtyDraft && !window.confirm('当前物品还有未保存修改，确定关闭吗？')) {
      return;
    }

    onClose?.();
  }

  function requestCopy() {
    if (saving || !imageAccess || !onCopy) return;
    if (dirtyDraft && !window.confirm('复制将使用已保存的物品内容，当前修改不会带入。继续复制？')) return;
    onCopy();
  }

  async function handleSave() {
    if (saving) {
      return;
    }

    const nextItem = {
      ...(mode === 'copy' ? {} : item),
      ...draft,
      notes: normalizeItemDetail(draft.notes),
      specification: normalizeItemDetail(draft.specification),
      locationIds: assignedLocationIds,
      locationId: assignedLocationIds[0] || null,
      tags: normalizeTagCodes(draft.tags)
    };
    const saveGeneration = editorGenerationRef.current;
    const isCurrentSave = () => editorGenerationRef.current === saveGeneration;

    setSaving(true);
    setImageFeedback({ type: '', message: '' });

    try {
      if (imageAccess) {
        if (!draft.name.trim()) throw new Error('请填写物品名称');
        if (!draft.categoryId || !categories.some((category) => category.id === draft.categoryId)) {
          throw new Error('请先选择分类');
        }
        if (pendingBrowserFile) {
          let staged = stagedBrowserUploadRef.current;
          if (staged?.file !== pendingBrowserFile) {
            const result = await imageAccess.upload(pendingBrowserFile);
            if (!isCurrentSave()) return;
            if (!result?.imageId) throw new Error('图片上传失败，请重试');
            staged = { file: pendingBrowserFile, imageId: result.imageId };
            stagedBrowserUploadRef.current = staged;
          }
          nextItem.imagePath = staged.imageId;
        } else if (mode === 'copy' && item?.imagePath) {
          let staged = stagedImageCopyRef.current;
          if (staged?.sourceImageId !== item.imagePath) {
            const result = await imageAccess.copy(item.imagePath);
            if (!isCurrentSave()) return;
            if (!result?.imageId || result.imageId === item.imagePath) throw new Error('图片复制失败，请重试');
            staged = { sourceImageId: item.imagePath, imageId: result.imageId };
            stagedImageCopyRef.current = staged;
          }
          nextItem.imagePath = staged.imageId;
        }
      }
      if (!isCurrentSave()) return;
      await onSave?.(nextItem);
      if (!isCurrentSave()) return;
      setPendingBrowserFile(null);
      stagedBrowserUploadRef.current = null;
      stagedImageCopyRef.current = null;
      setDirtyDraft(false);
    } catch (error) {
      if (isCurrentSave()) setImageFeedback({ type: 'error', message: error?.message || '物品保存失败' });
    } finally {
      if (isCurrentSave()) setSaving(false);
    }
  }

  function handleDialogKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="dialog-backdrop item-editor-backdrop web-item-editor-backdrop" role="presentation">
      <div
        className="dialog-card item-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="dialog-header item-editor-modal__header">
          <div>
            <h2 id="item-editor-title">{mode === 'copy' ? '复制新增' : mode === 'create' ? '新增物品' : draft.name || '未命名物品'}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={requestClose} disabled={saving} aria-label="关闭物品弹窗">
            关闭
          </button>
        </div>

        <div className="item-editor-modal__body">
          <section className="item-editor-modal__media">
            <div className="web-item-image-selection" aria-label="物品图片选择状态">
              <strong>{pendingBrowserFile ? pendingBrowserFile.name : draft.imagePath ? mode === 'copy' ? '沿用原物品图片' : '已保存图片' : '尚未选择图片'}</strong>
              <span>{pendingBrowserFile ? '已选择，保存物品时上传' : mode === 'copy' && draft.imagePath ? '保存时复制图片，也可以重新选择' : '选择图片后，保存物品时上传'}</span>
            </div>
            <div className="item-editor-modal__media-actions">
              <div className="item-editor-modal__source-actions web-item-editor-options">
                <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                  选择图片
                </button>
                {canManagePrivacy ? <label className="web-item-option-control">
                  <input type="checkbox" checked={draft.isPrivate || inheritedPrivate} disabled={saving || inheritedPrivate}
                    aria-describedby={inheritedPrivate ? 'item-privacy-inheritance' : undefined}
                    onChange={event => updateDraft({ isPrivate: event.target.checked })} />
                  <span>隐私区</span>
                </label> : null}
                <label className="web-item-option-control">
                  <input type="checkbox" checked={draft.isPackaged} disabled={saving}
                    onChange={event => updateDraft({ isPackaged: event.target.checked })} />
                  <span>包装</span>
                </label>
              </div>
              {canManagePrivacy && inheritedPrivate ? <p id="item-privacy-inheritance" className="privacy-inheritance-hint">所选分类或位置属于隐私区</p> : null}
              <input hidden ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" aria-label="从相册选择图片" disabled={saving} onChange={handleBrowserFile} />
              {imageFeedback.message ? (
                <p role={imageFeedback.type === 'error' ? 'alert' : 'status'} className={`image-feedback ${imageFeedback.type === 'error' ? 'is-error' : 'is-success'}`}>
                  {imageFeedback.message}
                </p>
              ) : null}
            </div>
          </section>

          <fieldset className="item-editor-modal__form" disabled={saving}>
            <div className="form-row form-row--2">
              <label className="field">
                <span>名称</span>
                <input autoFocus value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
              </label>
              <label className="field">
                <span>规格</span>
                <input placeholder="白色·S" value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} onBlur={(event) => { const notes = normalizeItemDetail(event.target.value); if (notes !== draft.notes) updateDraft({ notes }); }} />
              </label>
            </div>

            <div className="form-row form-row--3">
              <label className="field">
                <span>品牌</span>
                <input value={draft.brand} onChange={(event) => updateDraft({ brand: event.target.value })} />
              </label>
              <label className="field">
                <span>款式</span>
                <input placeholder="印花·镂空" value={draft.specification} onChange={(event) => updateDraft({ specification: event.target.value })} onBlur={(event) => { const specification = normalizeItemDetail(event.target.value); if (specification !== draft.specification) updateDraft({ specification }); }} />
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

            <section className="item-location-editor" aria-label="物品存放位置">
              {draft.locationIds.map((locationId, index) => {
                const selection = buildLocationSelection(locations, locationId);
                const level2Options = selection.level1Id ? getChildEntries(locations, selection.level1Id) : [];
                const level3Options = selection.level2Id ? getChildEntries(locations, selection.level2Id) : [];
                return <div className="item-location-editor__row" role="group" aria-label={`存放位置 ${index + 1}`} key={index}>
                  <div className="form-row form-row--3 item-location-editor__selects">
                    <label className="field">
                      <span>一级位置</span>
                      <select value={selection.level1Id} onChange={event => updateLocation(index, event.target.value)}>
                        <option value="">未选择</option>
                        {level1Options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>二级位置</span>
                      <select value={selection.level2Id} disabled={!level2Options.length}
                        onChange={event => updateLocation(index, event.target.value || selection.level1Id)}>
                        <option value="">{level2Options.length ? '未选择' : '无二级位置'}</option>
                        {level2Options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>三级位置</span>
                      <select value={selection.level3Id} disabled={!level3Options.length}
                        onChange={event => updateLocation(index, event.target.value || selection.level2Id || selection.level1Id)}>
                        <option value="">{level3Options.length ? '未选择' : '无三级位置'}</option>
                        {level3Options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="button" className="ghost-button item-location-editor__remove" aria-label={`移除位置 ${index + 1}`}
                    disabled={draft.locationIds.length === 1 && !locationId} onClick={() => removeLocation(index)}>移除</button>
                </div>;
              })}
              <button type="button" className="secondary-button item-location-editor__add"
                disabled={draft.locationIds.length >= 32 || draft.locationIds.includes('')}
                onClick={() => updateDraft({ locationIds: [...draft.locationIds, ''] })}>添加位置</button>
            </section>

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

          </fieldset>
        </div>

        <div className="dialog-actions item-editor-modal__actions">
          <div className="item-editor-modal__record-actions">
            {mode === 'edit' && onCopy ? (
              <button className="secondary-button" type="button" onClick={requestCopy} disabled={saving}>复制新增</button>
            ) : null}
            {mode === 'edit' ? (
              <button
                className="ghost-button danger-button"
                type="button"
                onClick={() => {
                  onDelete?.(item?.id);
                }}
                disabled={saving}
              >
                删除物品
              </button>
            ) : null}
          </div>
          <div className="item-editor-modal__action-group">
            <button className="ghost-button" type="button" onClick={requestClose} disabled={saving}>
              取消
            </button>
            <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
