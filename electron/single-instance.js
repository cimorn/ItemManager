function focusExistingWindow(window) {
  if (!window || window.isDestroyed()) {
    return false;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
  return true;
}

module.exports = {
  focusExistingWindow
};
