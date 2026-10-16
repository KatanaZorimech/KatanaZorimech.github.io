import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "../../packages/pet-fsm/src/index.ts");
const dest = path.join(root, "src/renderer/fsm.ts");

fs.copyFileSync(src, dest);
console.log("已同步 pet-fsm → src/renderer/fsm.ts");
