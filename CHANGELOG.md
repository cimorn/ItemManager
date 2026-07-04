# Changelog

## 26.03.30

- Renamed the app to 物品管理.
- Changed the project from a web app to an Electron desktop app.
- Moved runtime data to the exe-level `data` folder.
- Merged items, categories, locations, tags, and project settings into `data/project.json`.
- Saved images under `data/images/分类/子分类/文件名`.
- Added category, location, and tag management.
- Added smart tag numbering, batch editing, automatic backups, and backup export.
- Added single-instance startup: reopening the exe focuses the existing window.
- Flattened the desktop package so `ItemManager-V27.01.01.exe` and `data` sit directly under `dist`.
- Added GitHub Actions packaging for dated Windows exe artifacts.

## Before

- The old upload was a web version.
- Web deployment, public access, remote database, and OSS notes no longer apply.
