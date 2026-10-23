# Item Manager

[中文](README.md)

A self-hosted inventory app for desktop and mobile browsers. Manage photos, hierarchical categories and locations, multiple locations, tags, packaging flags, batch edits, duplicate items, and a private area.

Runs on Linux servers, Docker Desktop, and NAS devices. Images support `amd64` and `arm64`. Deployment requires Docker Compose 2.23.1+ and a private Alibaba Cloud OSS bucket.

## Deploy

```sh
git clone https://github.com/cimorn/ItemManager.git
cd ItemManager
cp .env.example .env
```

PowerShell: use `Copy-Item .env.example .env`. Set both passwords and your OSS settings in `.env`. Generate and copy the remaining four secrets:

```sh
docker run --rm node:24-bookworm-slim node -e "const c=require('node:crypto');for(const k of ['STORAGE_SESSION_SECRET','STORAGE_ENCRYPTION_KEY','STORAGE_MONGO_ROOT_PASSWORD','STORAGE_MONGO_PASSWORD'])console.log(k+'='+c.randomBytes(32).toString('hex'))"
docker compose up -d
```

Open [http://localhost:8094](http://localhost:8094).

For phone access, set `STORAGE_BIND_ADDRESS=0.0.0.0` and `STORAGE_PUBLIC_ORIGIN` to the actual LAN URL. For a domain, use an HTTPS reverse proxy, configure that origin, and set `STORAGE_ALLOW_HTTP=false`.

## Usage

Enter the access password to manage items and photos. Combine category, location, tag, and packaging filters. Drag categories and locations to reorder them.

Click the app name at the top-left to unlock the private area. Locking or refreshing hides it again.

## Development

Requires Node.js 24+ and pnpm 11.

```text
web/        Web frontend, server, and web tests
desktop/    Independent Electron client, icons, and build scripts
scripts/    Docker runtime and backup/restore checks
```

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Development runs at `http://127.0.0.1:5173` with in-memory fixtures. Passwords: `preview-storage` and `preview-private`.

```sh
pnpm test
pnpm build
pnpm desktop:dev
pnpm desktop:build
```

Web output: `web/dist/renderer/`. Windows output: `dist/Desktop-*/`. Configure the client URL in `desktop/src/policy.cjs`; see [client development](desktop/README.md).

## Publish and update

The web app and desktop client share a version in the form `YY.major.minor`. For example, `26.1.1` is the first minor release of the first major series in 2026. Before publishing, update `version` in all three `package.json` files at the root, in `web/`, and in `desktop/`, then push to `main`. Increment the version for each release.

After tests and Docker deployment checks pass, GitHub Actions publishes `ghcr.io/cimorn/itemmanager:latest` and the matching version tag, such as `ghcr.io/cimorn/itemmanager:26.1.1`. The `latest` tag follows `main`. The desktop client has a separate build job; download its EXE, with the version in its filename, from that job's Artifacts.

Update the web service from the deployment directory:

```sh
docker compose pull storage
docker compose up -d --no-deps storage
```

Reopen the client after a web update. Rebuild and replace the EXE when the client itself changes.

## Backups and recovery

Back up **MongoDB, the OSS `Storage/` prefix, and the original `.env`**. Keep the volume and `STORAGE_ENCRYPTION_KEY` when updating.

[Backup and restore commands (Chinese)](docs/backup.md) · [Image pinning and rollback](docs/docker-images.md)

## License

[MIT](LICENSE)
