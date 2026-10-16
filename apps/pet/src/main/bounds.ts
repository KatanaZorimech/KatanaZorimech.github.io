import { BrowserWindow, screen } from "electron";

/**
 * 将窗口钳制到最近显示器工作区内，保证至少有一部分可见（多屏拖拽边界修正）。
 * 必须用 setBounds 保持宽高：Windows DPI 下单独 setPosition 会导致窗口尺寸膨胀。
 * 若传入 lockedSize，钳制时也强制该宽高（防止拖拽过程中尺寸被污染后继续放大）。
 */
export function clampWindowToVisibleDisplays(
  win: BrowserWindow,
  lockedSize?: { width: number; height: number },
): void {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  const width = Math.round(lockedSize?.width ?? bounds.width);
  const height = Math.round(lockedSize?.height ?? bounds.height);
  const center = {
    x: Math.round(bounds.x + width / 2),
    y: Math.round(bounds.y + height / 2),
  };
  const display = screen.getDisplayNearestPoint(center);
  const work = display.workArea;
  const margin = 32;

  let x = bounds.x;
  let y = bounds.y;

  // 至少露出 margin 像素，避免拖到完全不可见
  const minX = work.x + margin - width;
  const maxX = work.x + work.width - margin;
  const minY = work.y + margin - height;
  const maxY = work.y + work.height - margin;

  x = Math.min(Math.max(minX, x), maxX);
  y = Math.min(Math.max(minY, y), maxY);

  if (x !== bounds.x || y !== bounds.y || bounds.width !== width || bounds.height !== height) {
    win.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width,
      height,
    }, false);
  }
}

/**
 * 仅平移窗口并强制锁定宽高。
 * Windows DPI / 部分 WM 在 setPosition、甚至 setBounds 后会悄悄改尺寸；
 * 必须用「布局锁定尺寸」覆盖，而不是信任 getBounds() 的宽高（可能已被污染）。
 */
export function moveWindowBy(
  win: BrowserWindow,
  dx: number,
  dy: number,
  lockedSize: { width: number; height: number },
): void {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  const width = Math.round(lockedSize.width);
  const height = Math.round(lockedSize.height);
  const next = {
    x: Math.round(bounds.x + dx),
    y: Math.round(bounds.y + dy),
    width,
    height,
  };
  win.setBounds(next, false);
  const after = win.getBounds();
  if (after.width !== width || after.height !== height) {
    win.setBounds({ x: after.x, y: after.y, width, height }, false);
  }
  clampWindowToVisibleDisplays(win, lockedSize);
}
