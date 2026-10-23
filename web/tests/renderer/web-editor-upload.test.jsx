import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemsGalleryPage from '../../src/renderer/features/items/ItemsGalleryPage';
import { ImageAccessProvider, useImageAccess } from '../../src/renderer/features/web/ImageAccessContext';

const categories = [
  { id: 'office', name: '办公', level: 1, parentId: null },
  { id: 'stationery', name: '文具', level: 2, parentId: 'office' }
];
const locations = [];
const item = { id: 'item-1', name: '标签机', categoryId: 'stationery', imagePath: '', tags: [] };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function CaptureAccess({ target }) { target.current = useImageAccess(); return null; }

function setup({ onSave = vi.fn(), onClose = vi.fn(), initialItem = item, api: overrides = {}, gallery = false, imageOptions = {} } = {}) {
  const access = { current: null };
  const api = {
    uploadImage: vi.fn(async () => ({ imageId: 'staged-image' })),
    readImage: vi.fn(async () => new Blob(['saved-image'], { type: 'image/png' })),
    ...overrides
  };
  URL.createObjectURL = vi.fn(() => 'blob:saved-image');
  URL.revokeObjectURL = vi.fn();
  const readFile = vi.spyOn(FileReader.prototype, 'readAsDataURL');
  const renderEditor = ({ editorPresent = true, ...props } = {}) => (
    <ImageAccessProvider api={api} {...imageOptions}>
      <CaptureAccess target={access} />
      {editorPresent ? <ItemEditorModal open item={initialItem} categories={categories} locations={locations} onSave={onSave} onClose={onClose} {...props} /> : null}
    </ImageAccessProvider>
  );
  const view = render(gallery ? (
    <ImageAccessProvider api={api} {...imageOptions}>
      <CaptureAccess target={access} />
      <ItemsGalleryPage allItems={[initialItem]} items={[initialItem]} categories={categories} locations={locations} onCreateItem={onSave} onSaveItem={onSave} />
    </ImageAccessProvider>
  ) : renderEditor());
  return { api, access, readFile, onSave, onClose, ...view, rerenderEditor: (props) => view.rerender(renderEditor(props)) };
}

async function selectPhoto(user, name = '相册照片.png') {
  const file = new File(['photo'], name, { type: 'image/png' });
  await user.upload(screen.getByLabelText('从相册选择图片'), file);
  return file;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('NAS editor deferred image upload', () => {
  it('does not retain staged preview bytes across successful saves even when a private item is absent from the returned ordinary project', async () => {
    const user = userEvent.setup(); let sequence = 0;
    const onSave = vi.fn(async () => ({ scope: 'ordinary', items: [] }));
    const { api, access } = setup({ onSave, imageOptions: { maxBytes: 4 }, api: { uploadImage: vi.fn(async () => ({ imageId: `saved-${++sequence}` })), readImage: vi.fn(async () => new Blob(['1234'])) } });
    await user.click(screen.getByLabelText('隐私区'));
    for (let index = 1; index <= 3; index++) {
      await user.upload(screen.getByLabelText('从相册选择图片'), new File(['1234'], `${index}.png`, { type: 'image/png' }));
      await user.click(screen.getByRole('button', { name: '保存', exact: true }));
      await waitFor(() => expect(screen.getByRole('button', { name: '保存', exact: true })).toBeEnabled());
      expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ isPrivate: true, imagePath: `saved-${index}` }));
      expect(URL.createObjectURL).toHaveBeenCalledTimes(index - 1);
      const preview = access.current.acquire(`ordinary-photo-${index}`);
      await expect(preview.promise).resolves.toBe('blob:saved-image');
      preview.release();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(index - 1);
    }
    expect(api.uploadImage).toHaveBeenCalledTimes(3);
    expect(api.readImage).toHaveBeenCalledTimes(3);
    access.current.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it('keeps a selected File local without reading or uploading it and omits editor previews and quick fill', async () => {
    const user = userEvent.setup();
    const { api, readFile } = setup();
    await selectPhoto(user);

    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(api.readImage).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '向左旋转图片' })).not.toBeInTheDocument();
    expect(screen.queryByText('快速填写')).not.toBeInTheDocument();
  });

  it('does not request an existing image when opening the editor', () => {
    const { api } = setup({ initialItem: { ...item, imagePath: 'already-saved-image' } });
    expect(api.readImage).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('已保存图片')).toBeInTheDocument();
  });

  it('cancels a selected photo without reading or uploading it', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { api, readFile, onClose, onSave } = setup();
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('validates name and category before reading or uploading a selected photo', async () => {
    const user = userEvent.setup();
    const { api, readFile, onSave } = setup({ initialItem: { ...item, name: '', categoryId: '' } });
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('请填写物品名称')).toBeInTheDocument();
    await user.type(screen.getByLabelText('名称'), '照片物品');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('请先选择分类')).toBeInTheDocument();
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uploads only on Save and passes its returned image ID to the awaited record save', async () => {
    const user = userEvent.setup();
    const upload = deferred();
    const save = deferred();
    const onSave = vi.fn(() => save.promise);
    const { api, readFile } = setup({ api: { uploadImage: vi.fn(() => upload.promise) }, onSave });
    await selectPhoto(user);
    await user.selectOptions(screen.getByLabelText('子分类'), 'stationery');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(screen.getByLabelText('名称')).toBeDisabled();
    expect(screen.getByLabelText('主分类')).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '关闭物品弹窗' })).toBeDisabled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await act(async () => upload.resolve({ imageId: 'uploaded-after-classification' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'stationery', imagePath: 'uploaded-after-classification' }));
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await act(async () => save.resolve());
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    expect(screen.getByLabelText('名称')).toBeEnabled();
  });

  it('keeps the draft and selected File after upload failure so Save can retry', async () => {
    const user = userEvent.setup();
    const uploadImage = vi.fn().mockRejectedValueOnce(new Error('上传断开')).mockResolvedValueOnce({ imageId: 'retry-image' });
    const { onSave } = setup({ api: { uploadImage } });
    await selectPhoto(user);
    await user.type(screen.getByLabelText('备注'), '保留这段草稿');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('上传断开')).toBeInTheDocument();
    expect(screen.getByLabelText('备注')).toHaveValue('保留这段草稿');
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imagePath: 'retry-image', notes: '保留这段草稿' })));
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it('reuses a successful staged upload after record save failure', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(new Error('保存断开')).mockResolvedValueOnce(undefined);
    const { api, access } = setup({ onSave, imageOptions: { maxBytes: 5 }, api: { readImage: vi.fn(async () => new Blob(['photo'])) } });
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('保存断开')).toBeInTheDocument();
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    const ordinary = access.current.acquire('ordinary');
    await expect(ordinary.promise).resolves.toBe('blob:saved-image');
    ordinary.release();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls.map(([draft]) => draft.imagePath)).toEqual(['staged-image', 'staged-image']);
  });

  it.each(['cancel', 'unmount', 'replace-file'])('leaves preview capacity free after a failed save followed by %s', async (change) => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSave = vi.fn().mockRejectedValueOnce(new Error('保存失败')).mockResolvedValueOnce(undefined);
    let sequence = 0;
    const { api, access, onClose, rerenderEditor } = setup({ onSave, imageOptions: { maxBytes: 5 }, api: { uploadImage: vi.fn(async () => ({ imageId: `selected-${++sequence}` })), readImage: vi.fn(async () => new Blob(['photo'])) } });
    await selectPhoto(user, 'first.png');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByText('保存失败')).toBeInTheDocument();
    expect(screen.getByText('first.png')).toBeInTheDocument();
    if (change === 'cancel') {
      await user.click(screen.getByRole('button', { name: '取消', exact: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      rerenderEditor({ open: false });
    } else if (change === 'unmount') rerenderEditor({ editorPresent: false });
    else {
      await selectPhoto(user, 'second.png');
      await user.click(screen.getByRole('button', { name: '保存', exact: true }));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
      expect(onSave.mock.calls.map(([draft]) => draft.imagePath)).toEqual(['selected-1', 'selected-2']);
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    const normal = access.current.acquire('ordinary');
    await expect(normal.promise).resolves.toBe('blob:saved-image');
    normal.release();
    expect(api.uploadImage).toHaveBeenCalledTimes(change === 'replace-file' ? 2 : 1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    access.current.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('preserves a dirty draft and selected File when the same record and catalogs refresh', async () => {
    const user = userEvent.setup();
    const { api, onSave, rerenderEditor } = setup();
    await user.type(screen.getByLabelText('备注'), '不能被项目刷新覆盖');
    await selectPhoto(user);
    rerenderEditor({ item: { ...item, name: '服务器更新的名称' }, categories: categories.map((category) => ({ ...category })), locations: [...locations] });

    expect(screen.getByLabelText('名称')).toHaveValue('标签机');
    expect(screen.getByLabelText('备注')).toHaveValue('不能被项目刷新覆盖');
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: '标签机', notes: '不能被项目刷新覆盖', imagePath: 'staged-image' })));
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending save frozen with its File and draft when same-record props refresh', async () => {
    const user = userEvent.setup();
    const upload = deferred();
    const { api, onSave, rerenderEditor } = setup({ api: { uploadImage: vi.fn(() => upload.promise) } });
    await user.type(screen.getByLabelText('备注'), '上传时保留');
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    rerenderEditor({ item: { ...item }, categories: categories.map((category) => ({ ...category })), locations: [...locations] });

    expect(screen.getByLabelText('备注')).toHaveValue('上传时保留');
    expect(screen.getByText('相册照片.png')).toBeInTheDocument();
    expect(screen.getByLabelText('备注')).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    await act(async () => upload.resolve({ imageId: 'refreshed-upload' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notes: '上传时保留', imagePath: 'refreshed-upload' }));
  });

  it.each(['close', 'unmount'])('does not save an obsolete upload after editor %s while its image provider remains mounted', async (endSession) => {
    const user = userEvent.setup();
    const upload = deferred();
    const { api, onSave, rerenderEditor } = setup({ api: { uploadImage: vi.fn(() => upload.promise) } });
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    rerenderEditor(endSession === 'close' ? { open: false } : { editorPresent: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => upload.resolve({ imageId: 'obsolete-upload' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('starts a fresh draft on record switch and ignores the previous record upload', async () => {
    const user = userEvent.setup();
    const upload = deferred();
    const { api, onSave, rerenderEditor } = setup({ api: { uploadImage: vi.fn(() => upload.promise) } });
    await user.type(screen.getByLabelText('备注'), '上一个物品的草稿');
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(1));
    rerenderEditor({ item: { ...item, id: 'item-2', name: '第二个物品' } });
    expect(screen.getByLabelText('名称')).toHaveValue('第二个物品');
    expect(screen.getByLabelText('备注')).toHaveValue('');
    expect(screen.getByLabelText('备注')).toBeEnabled();
    expect(screen.queryByText('相册照片.png')).not.toBeInTheDocument();
    await act(async () => upload.resolve({ imageId: 'old-record-upload' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the gallery editor open while saving and after an error, then closes on success', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onSave = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(undefined);
    setup({ gallery: true, onSave });
    await user.click(screen.getByRole('button', { name: '新增物品' }));
    await user.type(screen.getByLabelText('名称'), '新物品');
    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => pending.reject(new Error('项目未写入')));
    expect(await screen.findByText('项目未写入')).toBeInTheDocument();
    expect(screen.getByLabelText('名称')).toHaveValue('新物品');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
