import { BrowserWindow, screen } from "electron";

/**
 * 将窗口钳制到最近显示器工作区内，保证至少有一部分可见（多屏拖拽边界修正）。
 */
export function clampWindowToVisibleDisplays(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  const center = {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  };
  const display = screen.getDisplayNearestPoint(center);
  const work = display.workArea;
  const margin = 32;

  let x = bounds.x;
  let y = bounds.y;

  // 至少露出 margin 像素，避免拖到完全不可见
  const minX = work.x + margin - bounds.width;
  const maxX = work.x + work.width - margin;
  const minY = work.y + margin - bounds.height;
  const maxY = work.y + work.height - margin;

  x = Math.min(Math.max(minX, x), maxX);
  y = Math.min(Math.max(minY, y), maxY);

  if (x !== bounds.x || y !== bounds.y) {
    win.setPosition(Math.round(x), Math.round(y));
  }
}
