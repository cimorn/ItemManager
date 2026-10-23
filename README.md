# Storage

[English](README.en.md)

自托管物品管理工具，电脑和手机通过浏览器使用。支持图片、多级分类与位置、标签、包装标记、批量修改、复制新增和隐私区。

支持 Linux 服务器、Docker Desktop、NAS 等 Docker 环境，提供 `amd64`、`arm64` 镜像。部署需要 Docker Compose 2.23.1+ 和阿里云 OSS 私有存储桶。

## 部署

```sh
git clone https://github.com/cimorn/Storage.git
cd Storage
cp .env.example .env
```

PowerShell 使用 `Copy-Item .env.example .env`。编辑 `.env`，填写访问密码、隐私区密码和自己的 OSS 配置。生成其余四项密钥并填入：

```sh
docker run --rm node:24-bookworm-slim node -e "const c=require('node:crypto');for(const k of ['STORAGE_SESSION_SECRET','STORAGE_ENCRYPTION_KEY','STORAGE_MONGO_ROOT_PASSWORD','STORAGE_MONGO_PASSWORD'])console.log(k+'='+c.randomBytes(32).toString('hex'))"
docker compose up -d
```

打开 [http://localhost:8094](http://localhost:8094)。

手机访问时，将 `STORAGE_BIND_ADDRESS` 改为 `0.0.0.0`，`STORAGE_PUBLIC_ORIGIN` 改为实际局域网地址。域名访问时使用 HTTPS 反向代理，填写对应域名并设置 `STORAGE_ALLOW_HTTP=false`。

## 使用

输入访问密码后管理物品、上传图片，按分类、位置、标签和包装状态筛选。分类和位置支持拖动排序。

点击左上角“物品管理”输入隐私区密码；解锁后可设置隐私物品、分类和位置。锁定或刷新后重新隐藏。

## 开发

需要 Node.js 24+、pnpm 11。

```text
web/        网页前端、服务端和网页测试
desktop/    独立 Electron 客户端、图标和打包脚本
scripts/    Docker 运行与备份恢复检查
```

```sh
pnpm install --frozen-lockfile
pnpm dev
```

网页开发地址为 `http://127.0.0.1:5173`，使用内存测试数据。访问密码为 `preview-storage`，隐私区密码为 `preview-private`。

```sh
pnpm test
pnpm build
pnpm desktop:dev
pnpm desktop:build
```

网页构建输出到 `web/dist/renderer/`，Windows 客户端输出到 `dist/Desktop-*/`。客户端连接地址在 `desktop/src/policy.cjs` 配置，详见 [客户端开发说明](desktop/README.md)。

## 发布与更新

网页和客户端使用统一版本号，格式为“年份后两位.大版本.小版本”，例如 `26.1.1`，表示 2026 年的第 1 个大版本、第 1 个小版本。发布前同步更新根目录、`web/`、`desktop/` 下三个 `package.json` 的 `version`，再推送到 `main`。每次发布递增版本号。

GitHub Actions 测试并检查 Docker 部署后，自动发布 `ghcr.io/cimorn/itemmanager:latest` 和对应版本镜像，例如 `ghcr.io/cimorn/itemmanager:26.1.1`。`latest` 跟随 `main` 更新。客户端有独立构建任务，EXE 可从对应任务的 Artifacts 下载，文件名包含版本号。

在部署目录更新网页：

```sh
docker compose pull storage
docker compose up -d --no-deps storage
```

客户端只连接网页，网页更新后重新打开即可。客户端自身代码有变化时重新构建并替换 EXE。

## 备份与恢复

备份 **MongoDB、OSS 的 `Storage/` 目录、原 `.env`**。更新时保留原数据卷和 `STORAGE_ENCRYPTION_KEY`。

[备份与恢复命令](docs/backup.md) · [固定镜像与回退](docs/docker-images.md)

## 许可证

[MIT](LICENSE)
