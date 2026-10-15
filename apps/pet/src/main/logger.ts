import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

function logsDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

function logFilePath(): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logsDir(), `pet-${day}.log`);
}

function write(level: string, message: string, meta?: unknown): void {
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    const line = JSON.stringify({
      t: new Date().toISOString(),
      level,
      message,
      meta: meta === undefined ? undefined : serialize(meta),
    });
    fs.appendFileSync(logFilePath(), `${line}\n`, "utf8");
  } catch {
    // 日志失败不抛出，避免循环崩溃
  }
  if (level === "error") {
    console.error(`[pet] ${message}`, meta ?? "");
  } else {
    console.info(`[pet] ${message}`, meta ?? "");
  }
}

function serialize(meta: unknown): unknown {
  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message, stack: meta.stack };
  }
  return meta;
}

export function logInfo(message: string, meta?: unknown): void {
  write("info", message, meta);
}

export function logWarn(message: string, meta?: unknown): void {
  write("warn", message, meta);
}

export function logError(message: string, meta?: unknown): void {
  write("error", message, meta);
}

export function getLogsDirectory(): string {
  return logsDir();
}

/** 安装主进程崩溃 / 未捕获异常日志 */
export function installCrashLogging(): void {
  process.on("uncaughtException", (err) => {
    logError("uncaughtException", err);
  });
  process.on("unhandledRejection", (reason) => {
    logError("unhandledRejection", reason);
  });

  app.on("render-process-gone", (_event, _wc, details) => {
    logError("render-process-gone", details);
  });
  app.on("child-process-gone", (_event, details) => {
    logError("child-process-gone", details);
  });
}
