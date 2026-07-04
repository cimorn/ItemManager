import { useEffect, useState } from 'react';

function readInitialValue(initialValues, key) {
  return initialValues?.[key] || '';
}

export default function ProjectDialog({
  open,
  mode = 'create',
  title,
  confirmLabel,
  initialValues,
  onClose,
  onConfirm,
  onPickDirectory
}) {
  const [projectName, setProjectName] = useState(readInitialValue(initialValues, 'projectName'));
  const [parentDir, setParentDir] = useState(readInitialValue(initialValues, 'parentDir'));

  useEffect(() => {
    if (!open) {
      return;
    }

    setProjectName(readInitialValue(initialValues, 'projectName'));
    setParentDir(readInitialValue(initialValues, 'parentDir'));
  }, [initialValues, open]);

  if (!open) {
    return null;
  }

  async function handlePickDirectory() {
    const nextDir = await onPickDirectory?.();
    if (nextDir) {
      setParentDir(nextDir);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!projectName.trim() || !parentDir.trim()) {
      return;
    }

    await onConfirm?.({
      projectName: projectName.trim(),
      parentDir: parentDir.trim()
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">{mode === 'saveAs' ? '另存为项目' : '本地项目'}</p>
            <h2 id="project-dialog-title">{title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose} aria-label="关闭弹窗">
            关闭
          </button>
        </div>
        <form className="dialog-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>项目名称</span>
            <input
              autoFocus
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="例如：家庭库房"
            />
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
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={!projectName.trim() || !parentDir.trim()}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
