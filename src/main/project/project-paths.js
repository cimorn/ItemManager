const path = require('node:path');

function resolveProjectPaths(projectDir) {
  return {
    projectDir,
    projectFile: path.join(projectDir, 'project.json'),
    categoriesFile: path.join(projectDir, 'categories.json'),
    locationsFile: path.join(projectDir, 'locations.json'),
    itemsFile: path.join(projectDir, 'items.json'),
    exportsDir: path.join(projectDir, 'exports')
  };
}

module.exports = { resolveProjectPaths };
