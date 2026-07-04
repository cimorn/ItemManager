function PathRow({ label, value, onOpen }) {
  return (
    <div className="path-row">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <button className="ghost-button" type="button" onClick={onOpen}>
        打开
      </button>
    </div>
  );
}

export default function ProjectDataPanel({ project, onOpenProjectFolder, onOpenProjectFile, onOrganizeImages }) {
  const paths = project?.paths || {};

  return (
    <section className="workspace-card project-data-panel">
      <div className="workspace-card__header">
        <div>
          <p className="section-kicker">项目文件</p>
          <h2>直接查看项目目录和 JSON 数据</h2>
        </div>
        <div className="project-data-panel__actions">
          <button className="secondary-button" type="button" onClick={() => onOrganizeImages?.()}>
            整理旧图片
          </button>
          <button className="secondary-button" type="button" onClick={() => onOpenProjectFolder(paths.projectDir)}>
            打开项目文件夹
          </button>
        </div>
      </div>
      <div className="project-meta-grid">
        <div className="feature-card">
          <h3>基本信息</h3>
          <p>项目名称：{project?.meta?.name || '未命名项目'}</p>
          <p>创建时间：{project?.meta?.createdAt || '-'}</p>
          <p>更新时间：{project?.meta?.updatedAt || '-'}</p>
        </div>
        <div className="feature-card">
          <h3>文件入口</h3>
          <PathRow label="project.json" value={paths.projectFile} onOpen={() => onOpenProjectFile(paths.projectFile)} />
        </div>
      </div>
    </section>
  );
}
