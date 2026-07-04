# 物品管理

[English](README.en.md)

一个自己用的本地桌面物品管理软件。用来记录物品、图片、分类、位置、标签和数量，数据默认保存在软件同级的 `data` 目录，不需要浏览器、服务器或远程数据库。

README 截图使用 `docs/demo-data/project.json` 演示数据，不包含真实物品数据。

![物品总览](docs/images/items-overview.png)

## 下载

到 [Releases](https://github.com/cimorn/ItemManager/releases) 下载最新版 Windows 程序。

文件名格式：

```text
ItemManager-V26.07.05.exe
```

把 exe 放到固定文件夹运行。软件会在 exe 同级使用或创建 `data` 目录。

## 怎么用

1. 打开 `ItemManager-V26.07.05.exe`。
2. 点 `新增物品`，填写名称、品牌、规格、数量、分类和位置。
3. 选择图片。图片会按 `data/images/分类/子分类/文件名` 存放。
4. 给物品贴标签，例如 `BG-001`、`GJ-003`、`SN-002`。
5. 点 `保存`，数据会写入本地 `data/project.json`。

![编辑物品](docs/images/item-editor.png)

## 数据位置

默认目录结构：

```text
dist/
  ItemManager-V26.07.05.exe
  data/
    project.json
    images/
      服装/鞋子/...
      数码/设备/...
    backups/
    exports/
```

主要数据都在 `data/project.json`。图片在 `data/images`，备份在 `data/backups`，Excel 导出在 `data/exports`。

仓库里的 `docs/demo-data` 只用于 README 截图演示，不会替换你的本地 `data`。

## 分类和位置

分类固定两级，适合整理大类和子类。位置支持三级，适合记录房间、柜体、盒子或抽屉。

![分类管理](docs/images/category-manager.png)

![位置管理](docs/images/location-manager.png)

## 标签

标签用于给箱子或物品做编号。可以按分类、位置、标签搜索，也可以批量删除或改名。

![标签管理](docs/images/tag-manager.png)

## 常用功能

- 物品：查看、搜索、筛选、编辑物品。
- 分类：管理主分类和子分类。
- 位置：管理三级存放位置。
- 标签：查看、筛选、改名、删除已贴标签。
- 批量修改：一次修改多个物品的分类、位置或标签。
- 文件：新建、打开、另存、导入 Excel、导出 Excel、导出数据备份。
- 自动备份：保存前会保留本地备份，避免误改数据。

## 开发

```bash
pnpm install
pnpm test
pnpm run build:desktop
```

打包后 exe 和 `data` 会展开在 `dist` 下。

## License

MIT
