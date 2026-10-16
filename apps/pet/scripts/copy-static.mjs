import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRenderer = path.join(root, "src", "renderer");
const distRenderer = path.join(root, "dist", "renderer");
const petAssetsSrc = path.join(root, "assets", "pet");
const petAssetsDest = path.join(distRenderer, "assets", "pet");

fs.mkdirSync(distRenderer, { recursive: true });
fs.mkdirSync(petAssetsDest, { recursive: true });

for (const name of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(srcRenderer, name), path.join(distRenderer, name));
}

for (const name of fs.readdirSync(petAssetsSrc)) {
  if (!name.endsWith(".png") && !name.endsWith(".webp")) continue;
  fs.copyFileSync(path.join(petAssetsSrc, name), path.join(petAssetsDest, name));
}

console.log("已复制渲染静态资源 → dist/renderer（含立绘帧）");
