export default function ProjectHome({ recentProjects, onCreate, onOpenPicker, onImport, onOpenRecent }) {
  return (
    <main className="home-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="home-topline">
            <span className="brand-badge brand-badge--home" aria-hidden="true">
              物
            </span>
            <p className="section-kicker">物品管理</p>
          </div>
          <h1>把分类、位置和物品都收进一个更顺手的管理台</h1>
          <p>
            现在开始你可以用项目文件夹管理不同库存，分类两级、位置三级，保存和另存为都直接落到本地 JSON。
          </p>
          <div className="hero-metrics" aria-label="项目能力">
            <span>分类 2 级</span>
            <span>位置 3 级</span>
            <span>Excel 流转</span>
          </div>
        </div>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={onCreate}>
            新建项目
          </button>
          <button className="secondary-button" type="button" onClick={onOpenPicker}>
            打开项目
          </button>
          <button className="ghost-button" type="button" onClick={onImport}>
            从 Excel 创建项目
          </button>
        </div>
      </section>
      <section className="home-grid">
        <article className="feature-card feature-card--accent">
          <h2>这版重点</h2>
          <ul>
            <li>分类固定两级，位置支持三级树状管理。</li>
            <li>同一父级下自动提醒重名，避免目录越改越乱。</li>
            <li>支持本地 JSON 项目、保存、另存为与 Excel 导入导出。</li>
          </ul>
        </article>
        <article className="feature-card recent-card">
          <div className="panel-header">
            <div>
              <p className="section-kicker">最近项目</p>
              <h2>继续你上次的工作</h2>
            </div>
          </div>
          <div className="recent-list">
            {recentProjects?.length ? (
              recentProjects.map((project) => (
                <button
                  key={project.path}
                  className="recent-project"
                  type="button"
                  aria-label={project.name}
                  onClick={() => onOpenRecent(project.path)}
                >
                  <strong>{project.name}</strong>
                  <span>{project.path}</span>
                </button>
              ))
            ) : (
              <div className="empty-card">
                <p>还没有最近项目</p>
                <span>你可以先新建一个本地项目，或者从 Excel 创建。</span>
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
