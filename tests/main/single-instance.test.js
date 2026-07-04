import { describe, expect, it, vi } from 'vitest';

import { focusExistingWindow } from '../../electron/single-instance';

function createWindowDouble({ minimized = false, destroyed = false } = {}) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn()
  };
}

describe('focusExistingWindow', () => {
  it('restores and focuses the existing window when a second instance starts', () => {
    const window = createWindowDouble({ minimized: true });

    const focused = focusExistingWindow(window);

    expect(focused).toBe(true);
    expect(window.restore).toHaveBeenCalledTimes(1);
    expect(window.show).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it('ignores missing or destroyed windows', () => {
    expect(focusExistingWindow(null)).toBe(false);

    const window = createWindowDouble({ destroyed: true });

    expect(focusExistingWindow(window)).toBe(false);
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();
  });
});
