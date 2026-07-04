import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Toolbar from '../../src/renderer/features/layout/Toolbar';

describe('Toolbar data backup export', () => {
  it('shows data backup export in the file menu', async () => {
    const user = userEvent.setup();
    const onExportDataBackup = vi.fn();

    render(
      <Toolbar
        selectedSection="items"
        selectedCatalogMode="category"
        onExportDataBackup={onExportDataBackup}
        desktopMode
      />
    );

    await user.click(screen.getByRole('button', { name: '文件' }));
    await user.click(screen.getByRole('menuitem', { name: '导出数据备份' }));

    expect(onExportDataBackup).toHaveBeenCalledTimes(1);
  });
});
