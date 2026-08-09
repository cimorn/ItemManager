import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,cXJjb2Rl')
  }
}));

const categories = [
  { id: 'cat_office', name: '办公', level: 1, parentId: null },
  { id: 'cat_stationery', name: '文具', level: 2, parentId: 'cat_office' }
];

const locations = [{ id: 'loc_study', name: '书房', level: 1, parentId: null }];
const TEST_PHOTO = 'data:image/webp;base64,UklGRg==';

describe('ItemEditorModal phone photo capture', () => {
  it('keeps a received phone photo pending until the item is saved', async () => {
    const user = userEvent.setup();
    let photoListener = null;
    const createSession = vi.fn(async () => ({
      id: 'session-1',
      url: 'http://192.168.1.8:43210/capture/session-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }));
    const commitPhoto = vi.fn(async () => ({
      relativePath: 'images/办公/文具/办公-文具-260809-120000.webp'
    }));
    const saveItem = vi.fn();

    render(
      <ItemEditorModal
        open
        item={{
          id: 'item_1',
          name: '标签机',
          categoryId: 'cat_stationery',
          locationId: 'loc_study',
          imagePath: '',
          tags: []
        }}
        categories={categories}
        locations={locations}
        projectDir="C:/data"
        onCreatePhotoSession={createSession}
        onPhotoReceived={(listener) => {
          photoListener = listener;
          return () => {
            photoListener = null;
          };
        }}
        onCommitPhoto={commitPhoto}
        onDiscardPhoto={vi.fn(async () => true)}
        onSave={saveItem}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '手机拍照' }));
    expect(await screen.findByRole('img', { name: '手机拍照二维码' })).toBeInTheDocument();

    act(() => {
      photoListener?.({
        sessionId: 'session-1',
        dataUrl: TEST_PHOTO,
        mimeType: 'image/webp',
        size: 4
      });
    });

    expect(screen.getByText('待保存')).toBeInTheDocument();
    expect(commitPhoto).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(commitPhoto).toHaveBeenCalledTimes(1));
    expect(commitPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        item: expect.objectContaining({ categoryId: 'cat_stationery' })
      })
    );
    expect(saveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePath: 'images/办公/文具/办公-文具-260809-120000.webp'
      })
    );
  });

  it('clears a pending photo when its capture session expires', async () => {
    const user = userEvent.setup();
    let photoListener = null;

    render(
      <ItemEditorModal
        open
        item={{ id: 'item_1', name: '标签机', categoryId: 'cat_stationery', imagePath: '', tags: [] }}
        categories={categories}
        locations={locations}
        projectDir="C:/data"
        onCreatePhotoSession={async () => ({
          id: 'session-expiring',
          url: 'http://192.168.1.8:43210/capture/session-expiring',
          expiresAt: new Date(Date.now() + 50).toISOString()
        })}
        onPhotoReceived={(listener) => {
          photoListener = listener;
          return () => {};
        }}
        onCommitPhoto={vi.fn()}
        onDiscardPhoto={vi.fn(async () => true)}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '手机拍照' }));
    act(() => {
      photoListener?.({ sessionId: 'session-expiring', dataUrl: TEST_PHOTO, mimeType: 'image/webp', size: 4 });
    });
    expect(screen.getByText('待保存')).toBeInTheDocument();

    expect(await screen.findByText('拍照二维码已过期，请重新生成')).toBeInTheDocument();
    expect(screen.queryByText('待保存')).not.toBeInTheDocument();
  });
});
