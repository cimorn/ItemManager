# 桌面客户端

客户端连接已部署的物品管理网站，不包含网页前后端和数据库。

在 `src/policy.cjs` 设置网站地址，并同步修改 `src/pages/` 两个提示页的重连地址。在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
pnpm test:desktop
pnpm desktop:build
```

Windows x64 便携 EXE、使用说明和 SHA-256 校验输出到根目录 `dist/Desktop-*/`。

网页更新后重新打开客户端；客户端代码更新后替换 EXE，保留同级 `data/` 目录。登录会话只保存在内存中，退出后需重新登录。物品和图片备份见 [备份说明](../docs/backup.md)。
