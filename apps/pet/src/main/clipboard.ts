import { clipboard } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateCopyKeystroke(): Promise<{ ok: boolean; detail?: string }> {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to keystroke "c" using command down',
      ]);
      return { ok: true };
    }
    if (process.platform === "win32") {
      // 尽力而为：通过 PowerShell 发送 Ctrl+C
      const script =
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')";
      await execFileAsync("powershell", ["-NoProfile", "-Command", script]);
      return { ok: true };
    }
    // Linux：优先 xdotool
    await execFileAsync("xdotool", ["key", "ctrl+c"]);
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, detail };
  }
}

export type CaptureResult = {
  text: string;
  truncated: boolean;
  originalLength: number;
  usedSimulateCopy: boolean;
  simulateCopyFailed?: string;
  restoredClipboard: boolean;
};

/**
 * 读取选区文本：可选先模拟复制；尽力备份/恢复剪贴板。
 */
export async function captureSelectionText(opts: {
  simulateCopy: boolean;
  maxChars: number;
}): Promise<CaptureResult> {
  const previous = clipboard.readText();
  let usedSimulateCopy = false;
  let simulateCopyFailed: string | undefined;
  let restoredClipboard = false;

  if (opts.simulateCopy) {
    usedSimulateCopy = true;
    const sim = await simulateCopyKeystroke();
    if (!sim.ok) {
      simulateCopyFailed = sim.detail ?? "模拟复制失败";
    } else {
      await sleep(180);
    }
  }

  let text = clipboard.readText().trim();

  // 若模拟复制后仍空，回退到模拟前剪贴板内容
  if (!text && previous.trim()) {
    text = previous.trim();
  }

  // 尽力恢复用户原剪贴板（仅当我们改过剪贴板时）
  if (opts.simulateCopy && previous !== clipboard.readText()) {
    try {
      clipboard.writeText(previous);
      restoredClipboard = true;
    } catch {
      restoredClipboard = false;
    }
  }

  const originalLength = text.length;
  let truncated = false;
  if (text.length > opts.maxChars) {
    text = text.slice(0, opts.maxChars);
    truncated = true;
  }

  return {
    text,
    truncated,
    originalLength,
    usedSimulateCopy,
    simulateCopyFailed,
    restoredClipboard,
  };
}
