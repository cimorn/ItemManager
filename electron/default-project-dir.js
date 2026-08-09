const path = require('node:path');

function getDefaultProjectDir({ isPackaged, execPath = process.execPath, devRoot = path.join(__dirname, '..') }) {
  const appRoot = isPackaged ? path.dirname(execPath) : devRoot;

  return path.join(appRoot, 'data');
}

module.exports = {
  getDefaultProjectDir
};
