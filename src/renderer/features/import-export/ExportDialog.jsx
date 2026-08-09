import { useEffect, useState } from 'react';

export default function ExportDialog({ open, title, confirmLabel, initialValues, onClose, onConfirm, onPickSavePath }) {
  const [filePath, setFilePath] = useState(initialValues?.filePath || '');

  useEffect(() => {
    if (open) {
      setFilePath(initialValues?.filePath || '');
    }
  }, [initialValues, open]);

  if (!open) {
    return null;
  }

  async function handlePickFile() {
    const selectedPath = await onPickSavePath?.();
    if (selectedPath) {
      setFilePath(selectedPath);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!filePath.trim()) {
      return;
    }

    await onConfirm?.({
      filePath: filePath.trim()
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Excel 工作簿</p>
            <h2 id="export-dialog-title">{title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose} aria-label="关闭弹窗">
            关闭
          </button>
        </div>
        <form className="dialog-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>导出位置</span>
            <div className="inline-field">
              <input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="请选择导出路径" />
              <button className="secondary-button" type="button" onClick={handlePickFile}>
                选择文件
              </button>
            </div>
          </label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={!filePath.trim()}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
