import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "..", "dist");
const indexHtml = path.join(dist, "index.html");
const notFoundHtml = path.join(dist, "404.html");

if (!fs.existsSync(indexHtml)) {
  console.error("copy-404: dist/index.html missing — run vite build first");
  process.exit(1);
}
fs.copyFileSync(indexHtml, notFoundHtml);
console.log("copy-404: wrote dist/404.html");
