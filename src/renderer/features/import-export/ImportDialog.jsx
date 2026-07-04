import { useEffect, useState } from 'react';

function readInitialValue(initialValues, key, fallback = '') {
  return initialValues?.[key] || fallback;
}

export default function ImportDialog({
  open,
  kind = 'import',
  title,
  confirmLabel,
  initialValues,
  onClose,
  onConfirm,
  onPickFile,
  onPickDirectory
}) {
  const [filePath, setFilePath] = useState(readInitialValue(initialValues, 'filePath'));
  const [mode, setMode] = useState(readInitialValue(initialValues, 'mode', 'merge'));
  const [projectName, setProjectName] = useState(readInitialValue(initialValues, 'projectName'));
  const [parentDir, setParentDir] = useState(readInitialValue(initialValues, 'parentDir'));

  useEffect(() => {
    if (!open) {
      return;
    }

    setFilePath(readInitialValue(initialValues, 'filePath'));
    setMode(readInitialValue(initialValues, 'mode', 'merge'));
    setProjectName(readInitialValue(initialValues, 'projectName'));
    setParentDir(readInitialValue(initialValues, 'parentDir'));
  }, [initialValues, open]);

  if (!open) {
    return null;
  }

  async function handlePickFile() {
    const selectedFile = await onPickFile?.();
    if (selectedFile) {
      setFilePath(selectedFile);
    }
  }

  async function handlePickDirectory() {
    const selectedDir = await onPickDirectory?.();
    if (selectedDir) {
      setParentDir(selectedDir);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!filePath.trim()) {
      return;
    }

    if (kind === 'create') {
      await onConfirm?.({
        filePath: filePath.trim(),
        projectName: projectName.trim(),
        parentDir: parentDir.trim()
      });
      return;
    }

    await onConfirm?.({
      filePath: filePath.trim(),
      mode
    });
  }

  const disabled =
    !filePath.trim() || (kind === 'create' ? !projectName.trim() || !parentDir.trim() : false);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Excel 工作簿</p>
            <h2 id="import-dialog-title">{title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose} aria-label="关闭弹窗">
            关闭
          </button>
        </div>
        <form className="dialog-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Excel 文件</span>
            <div className="inline-field">
              <input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="请选择 .xlsx 文件" />
              <button className="secondary-button" type="button" onClick={handlePickFile}>
                选择文件
              </button>
            </div>
          </label>
          {kind === 'create' ? (
            <>
              <label className="field">
                <span>项目名称</span>
                <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：宿舍仓库" />
              </label>
              <label className="field">
                <span>保存位置</span>
                <div className="inline-field">
                  <input value={parentDir} onChange={(event) => setParentDir(event.target.value)} placeholder="请选择目录" />
                  <button className="secondary-button" type="button" onClick={handlePickDirectory}>
                    选择位置
                  </button>
                </div>
              </label>
            </>
          ) : (
            <label className="field">
              <span>导入方式</span>
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="merge">合并到现有项目</option>
                <option value="replace">覆盖当前数据</option>
              </select>
            </label>
          )}
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={disabled}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
