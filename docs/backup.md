# 数据备份与恢复

完整备份包括三部分：MongoDB 数据库、OSS 的 `Storage/` 目录、部署目录的 `.env`。缺少原来的 `STORAGE_ENCRYPTION_KEY` 会无法解密数据。

## 备份

在部署目录执行。为保证数据库与图片一致，备份期间暂停应用，数据库继续运行：

```sh
mkdir backups
docker compose stop storage
docker compose exec -T mongodb-storage sh -c 'mongodump --gzip --archive=/tmp/storage.archive.gz --db storage --username "$STORAGE_MONGO_USERNAME" --password "$STORAGE_MONGO_PASSWORD" --authenticationDatabase storage'
docker compose cp mongodb-storage:/tmp/storage.archive.gz backups/storage.archive.gz
cp .env backups/.env
```

安装并配置 [ossutil](https://www.alibabacloud.com/help/en/oss/developer-reference/cp-download-file)，将 `YOUR_BUCKET` 换成 `.env` 中的桶名：

```sh
ossutil cp oss://YOUR_BUCKET/Storage/ backups/Storage/ -r
docker compose start storage
```

为每次备份使用单独的目录，并将整份备份复制到另一台设备或私有存储。备份中的 `.env` 含密钥，不要上传到 GitHub。

## 恢复

现有部署先执行 `docker compose stop storage`。新机器先准备相同的 Compose 文件和原来的 `.env`。下面的 `--drop` 会用备份替换 `storage` 数据库里的同名集合：

```sh
cp backups/.env .env
docker compose up -d --wait mongodb-storage
docker compose cp backups/storage.archive.gz mongodb-storage:/tmp/storage.archive.gz
docker compose exec -T mongodb-storage sh -c 'mongorestore --gzip --archive=/tmp/storage.archive.gz --nsInclude="storage.*" --drop --username "$STORAGE_MONGO_USERNAME" --password "$STORAGE_MONGO_PASSWORD" --authenticationDatabase storage'
ossutil cp backups/Storage/ oss://YOUR_BUCKET/Storage/ -r
docker compose up -d storage
```

如果备份位于其他目录，替换命令里的 `backups/`。恢复到原桶时，应先确认目标 `Storage/` 前缀属于该项目；其他目录不需要操作。

打开网站，核对物品数量、分类、位置、图片及隐私区内容。

MongoDB 的压缩归档参数见 [官方恢复说明](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-examples/)。
