# Changelog

## 26.08.09

- Added phone photo capture through a temporary local-network QR code.
- Kept received photos in memory until the item is saved.
- Saved captured photos as WebP under the selected category folders.
- Discarded unsaved photos when editing is cancelled or the session expires.

## 26.03.30

- Renamed the app to 物品管理.
- Changed the project from a web app to an Electron desktop app.
- Moved runtime data to the exe-level `data` folder.
- Merged items, categories, locations, tags, and project settings into `data/project.json`.
- Saved images under `data/images/分类/子分类/文件名`.
- Added category, location, and tag management.
- Added smart tag numbering, batch editing, automatic backups, and backup export.
- Added single-instance startup: reopening the exe focuses the existing window.
- Flattened the desktop package so the versioned exe and `data` sit directly under `dist`.
- Added GitHub Actions packaging for dated Windows exe artifacts.

## Before

- The old upload was a web version.
- Web deployment, public access, remote database, and OSS notes no longer apply.
