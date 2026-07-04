const fs = require('node:fs/promises');
const path = require('node:path');

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function sanitizeSegment(value) {
  const sanitized = toText(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '');
  return sanitized || '未分类';
}

function splitCategoryPath(categoryPath) {
  return toText(categoryPath)
    .split('/')
    .map((entry) => sanitizeSegment(entry))
    .filter(Boolean);
}

function splitRelativePath(relativePath) {
  return toText(relativePath)
    .replace(/\\/g, '/')
    .split('/')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeRelativePath(parts) {
  return parts.join('/');
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function createUniqueImageTarget(projectDir, targetParts) {
  const fileName = targetParts.at(-1);
  const directoryParts = targetParts.slice(0, -1);
  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  let candidateParts = targetParts;
  let index = 1;

  while (await pathExists(path.join(projectDir, ...candidateParts))) {
    candidateParts = [...directoryParts, `${baseName}-${index}${extension}`];
    index += 1;
  }

  return {
    relativePath: normalizeRelativePath(candidateParts),
    absolutePath: path.join(projectDir, ...candidateParts)
  };
}

async function moveFile(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fs.rename(sourcePath, targetPath);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }

    await fs.copyFile(sourcePath, targetPath);
    await fs.unlink(sourcePath);
  }
}

function formatTimestamp(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

async function importProjectImage({ projectDir, categoryPath, sourceFilePath }) {
  const categorySegments = splitCategoryPath(categoryPath);

  if (!categorySegments.length) {
    throw new Error('上传图片前请先选择分类');
  }

  if (!toText(projectDir) || !toText(sourceFilePath)) {
    throw new Error('缺少项目目录或图片文件');
  }

  const extension = path.extname(sourceFilePath) || '.png';
  const fileName = `${categorySegments.join('-')}-${formatTimestamp()}${extension}`;
  const imagesDir = path.join(projectDir, 'images', ...categorySegments);
  const absolutePath = path.join(imagesDir, fileName);
  const relativePath = ['images', ...categorySegments, fileName].join('/');

  await fs.mkdir(imagesDir, { recursive: true });
  await fs.copyFile(sourceFilePath, absolutePath);

  return {
    relativePath,
    absolutePath
  };
}

async function organizeProjectImages(project) {
  const projectDir = toText(project?.paths?.projectDir || project?.projectDir);

  if (!projectDir) {
    throw new Error('缺少项目目录');
  }

  let movedCount = 0;
  let skippedCount = 0;
  const warnings = [];
  const nextItems = [];

  for (const item of project.items || []) {
    const imageParts = splitRelativePath(item.imagePath);
    const categorySegments = splitCategoryPath(item.categoryPath);
    const fileName = imageParts.at(-1);

    if (!imageParts.length || imageParts[0] !== 'images' || !fileName || !categorySegments.length) {
      skippedCount += item.imagePath ? 1 : 0;
      nextItems.push(item);
      continue;
    }

    const targetFolderParts = ['images', ...categorySegments];
    const currentFolderParts = imageParts.slice(0, -1);
    const targetParts = [...targetFolderParts, fileName];

    if (normalizeRelativePath(currentFolderParts) === normalizeRelativePath(targetFolderParts)) {
      nextItems.push(item);
      continue;
    }

    const sourceAbsolutePath = path.join(projectDir, ...imageParts);
    if (!(await pathExists(sourceAbsolutePath))) {
      skippedCount += 1;
      warnings.push(`${item.name || item.id || '物品'} 的图片不存在：${item.imagePath}`);
      nextItems.push(item);
      continue;
    }

    const initialTargetPath = path.join(projectDir, ...targetParts);
    const sourceResolved = path.resolve(sourceAbsolutePath);
    const targetResolved = path.resolve(initialTargetPath);
    const target = sourceResolved === targetResolved
      ? {
          relativePath: normalizeRelativePath(targetParts),
          absolutePath: initialTargetPath
        }
      : await createUniqueImageTarget(projectDir, targetParts);

    await moveFile(sourceAbsolutePath, target.absolutePath);
    movedCount += 1;
    nextItems.push({
      ...item,
      imagePath: target.relativePath
    });
  }

  return {
    project: {
      ...project,
      items: nextItems
    },
    movedCount,
    skippedCount,
    warnings
  };
}

module.exports = {
  formatTimestamp,
  importProjectImage,
  organizeProjectImages,
  sanitizeSegment,
  splitCategoryPath
};
