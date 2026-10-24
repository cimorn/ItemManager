# 镜像与回退

镜像：`ghcr.io/cimorn/storage`，支持 `linux/amd64` 和 `linux/arm64`。Docker 会选择与主机匹配的架构。

## 部署与更新

按 [README](../README.md) 创建 `.env` 并启动。数据库使用 Docker 数据卷，不依赖主机的固定目录。

```sh
docker compose pull storage
docker compose up -d --no-deps storage
docker compose ps
```

更新时保留原部署文件、数据库挂载和 `.env`，尤其是 `STORAGE_ENCRYPTION_KEY`。

## 固定镜像与回退

在 `.env` 设置：

```dotenv
STORAGE_IMAGE=ghcr.io/cimorn/storage:26.1.6
```

随后执行上面的更新命令。恢复旧镜像时，填回之前使用的标签。升级前备份数据库、OSS 图片和 `.env`。

## 构建

版本号采用“年份后两位.大版本.小版本”，例如 `26.1.1`。发布前同步更新根目录、`web/`、`desktop/` 下三个 `package.json` 的 `version`，每次发布递增版本号，再推送到 `main`。

GitHub Actions 自动运行测试、检查 Docker 部署并发布 `latest` 和对应版本镜像，例如 `26.1.1`。`latest` 跟随 `main` 更新；需要固定版本或回退时使用具体版本标签。拉取请求只执行检查。

```sh
docker build -t storage:local .
node scripts/check-container.cjs storage:local
node scripts/check-compose.cjs storage:local
```

实际密码、密钥和数据只放在部署主机及私有存储中。
