function buildAppMenuTemplate({ sendCommand }) {
  return [
    {
      label: '文件',
      submenu: [
        { label: '新建项目', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('project:new') },
        { label: '打开项目', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('project:open') },
        { label: '从 Excel 创建项目', accelerator: 'CmdOrCtrl+Shift+I', click: () => sendCommand('project:import-home') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('project:save') },
        { label: '另存为', accelerator: 'Shift+CmdOrCtrl+S', click: () => sendCommand('project:save-as') },
        { type: 'separator' },
        { label: '导入 Excel', accelerator: 'CmdOrCtrl+I', click: () => sendCommand('project:import-current') },
        { label: '导出 Excel', accelerator: 'CmdOrCtrl+E', click: () => sendCommand('project:export') },
        { label: '导出数据备份', accelerator: 'CmdOrCtrl+B', click: () => sendCommand('project:export-backup') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggledevtools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetzoom', label: '实际大小' },
        { role: 'zoomin', label: '放大' },
        { role: 'zoomout', label: '缩小' }
      ]
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize', label: '最小化' }, { role: 'close', label: '关闭窗口' }]
    }
  ];
}

module.exports = { buildAppMenuTemplate };
