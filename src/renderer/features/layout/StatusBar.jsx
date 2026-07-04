export default function StatusBar({ project, dirty, notice }) {
  const summary = `${project?.items?.length || 0} 个物品`;

  return (
    <footer className="status-bar">
      <span>{project?.paths?.projectDir || '尚未打开项目'}</span>
      <span>{summary}</span>
      <span>{dirty ? '等待保存' : '磁盘已同步'}</span>
      <span>{notice || '准备就绪'}</span>
    </footer>
  );
}
