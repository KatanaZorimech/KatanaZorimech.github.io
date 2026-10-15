import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRenderer = path.join(root, "src", "renderer");
const distRenderer = path.join(root, "dist", "renderer");

fs.mkdirSync(distRenderer, { recursive: true });

for (const name of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(srcRenderer, name), path.join(distRenderer, name));
}

console.log("已复制渲染静态资源 → dist/renderer");
