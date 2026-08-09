# 手机扫码拍照实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use $superpower-subagents (recommended) or $superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking via update_plan.

**Goal:** 在物品编辑窗口中创建局域网二维码，让手机拍照后把照片暂存到电脑内存，并在保存物品时写入分类图片目录。

**Architecture:** Electron 主进程按需启动一个仅服务拍照会话的 HTTP 服务。手机页压缩并上传照片，主进程缓存最新照片并通过 IPC 通知当前编辑窗口；保存物品时，主进程再把缓存写入项目目录。

**Tech Stack:** Electron IPC、Node.js HTTP/crypto/os、React、QRCode、Vitest、Testing Library

---

### Task 1: 局域网拍照会话服务

**Files:**
- Create: `src/main/photo-capture/mobile-capture-page.js`
- Create: `src/main/photo-capture/photo-capture-service.js`
- Modify: `src/main/project/project-image-service.js`
- Test: `tests/main/photo-capture-service.test.js`

- [ ] **Step 1: 写失败测试**

创建真实临时目录并启动服务，验证上传只进入内存，提交后才创建图片：

```js
const service = createPhotoCaptureService({ hostAddress: '127.0.0.1', sessionTtlMs: 60_000 });
const session = await service.createSession();
await postPhoto(session.url, TEST_WEBP_DATA_URL);
expect(await fs.readdir(projectDir)).toEqual([]);

const saved = await service.commitSession({
  sessionId: session.id,
  projectDir,
  categoryPath: '办公/文具'
});
expect(saved.relativePath).toMatch(/^images\/办公\/文具\/.+\.webp$/);
```

同一测试文件再验证取消会话后不能提交，且不会创建文件。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm exec vitest run tests/main/photo-capture-service.test.js`

Expected: FAIL，原因是 `photo-capture-service.js` 尚不存在。

- [ ] **Step 3: 实现最小服务**

公开接口固定为：

```js
const service = createPhotoCaptureService(options);
await service.createSession();
await service.commitSession({ sessionId, projectDir, categoryPath });
await service.discardSession(sessionId);
service.on('photo-received', listener);
await service.close();
```

服务使用随机 32 字节十六进制会话 ID、10 分钟有效期和 12 MB 请求上限。`POST /api/photo-capture/:id` 校验 Data URL 图片类型，只缓存最新照片。`GET /capture/:id` 返回独立手机页。

在 `project-image-service.js` 增加 `saveProjectImageData({ projectDir, categoryPath, dataUrl })`，沿用现有分类清理、时间命名和图片目录规则。

- [ ] **Step 4: 运行目标测试**

Run: `pnpm exec vitest run tests/main/photo-capture-service.test.js`

Expected: PASS。

### Task 2: Electron IPC 与编辑窗口

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/main/ipc/register-desktop-ipc.js`
- Modify: `src/renderer/lib/desktop-api.js`
- Modify: `src/renderer/App.jsx`
- Modify: `src/renderer/features/layout/AppShell.jsx`
- Modify: `src/renderer/features/items/ItemsGalleryPage.jsx`
- Modify: `src/renderer/features/items/ItemEditorModal.jsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/item-editor-photo-capture.test.jsx`

- [ ] **Step 1: 写失败测试**

渲染编辑窗口，创建会话并模拟收到照片，验证二维码和待保存预览；点击保存后才调用提交接口：

```jsx
render(<ItemEditorModal
  open
  categories={categories}
  locations={locations}
  onCreatePhotoSession={createSession}
  onPhotoReceived={(listener) => subscribe(listener)}
  onCommitPhoto={commitPhoto}
  onDiscardPhoto={discardPhoto}
  onSave={saveItem}
/>);

await user.click(screen.getByRole('button', { name: '手机拍照' }));
emitPhoto({ sessionId: 'session-1', dataUrl: TEST_IMAGE });
expect(screen.getByText('待保存')).toBeInTheDocument();
expect(commitPhoto).not.toHaveBeenCalled();
await user.click(screen.getByRole('button', { name: '保存' }));
expect(commitPhoto).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm exec vitest run tests/renderer/item-editor-photo-capture.test.jsx`

Expected: FAIL，页面中没有“手机拍照”。

- [ ] **Step 3: 接入 IPC 与 React 状态**

预加载桥接固定为：

```js
photoCapture: {
  createSession: () => ipcRenderer.invoke('photo-capture:create-session'),
  commit: (payload) => ipcRenderer.invoke('photo-capture:commit', payload),
  discard: (sessionId) => ipcRenderer.invoke('photo-capture:discard', sessionId),
  onPhotoReceived: (listener) => subscribe('photo-capture:received', listener)
}
```

编辑窗口保存 `photoSession` 和 `pendingPhoto`。收到匹配会话的照片后显示 Data URL 预览和“待保存”；保存时先提交图片，再把返回的 `relativePath` 传给现有 `onSave`。取消、关闭和重新创建会话时调用 `discard`。

二维码使用现有 `qrcode` 依赖生成。面板只显示二维码、地址、过期时间、等待状态和重新生成按钮。

- [ ] **Step 4: 运行两个目标测试**

Run: `pnpm exec vitest run tests/main/photo-capture-service.test.js tests/renderer/item-editor-photo-capture.test.jsx`

Expected: 两个测试文件全部 PASS。

### Task 3: 验证与打包

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新变更说明**

在当前版本下增加“局域网二维码手机拍照；照片保存前仅暂存在内存”。

- [ ] **Step 2: 运行最小回归集**

Run: `pnpm exec vitest run tests/main/photo-capture-service.test.js tests/renderer/item-editor-photo-capture.test.jsx tests/main/project-service-single-file.test.js`

Expected: 全部 PASS。

- [ ] **Step 3: 构建渲染进程和 Windows 软件**

Run: `pnpm run build`

Expected: Vite 构建成功。

Run: `pnpm run build:desktop`

Expected: `dist/ItemManager-V<日期>.exe` 生成，`dist/data` 保留。

- [ ] **Step 4: 实机流程检查**

启动 EXE，打开物品编辑窗口，生成二维码；同一局域网手机扫码、拍照、发送。确认电脑显示“待保存”，取消不产生文件；重新操作并保存后，图片出现在对应分类目录。

- [ ] **Step 5: 整理单提交**

把设计、计划和实现合并进仓库唯一提交，再更新版本标签和发布文件；不保留中间提交。
