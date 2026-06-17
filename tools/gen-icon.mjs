// Одноразовый генератор app.ico из frontend/public/favicon.svg.
// Зависимость только @resvg/resvg-js (есть prebuilt под win-arm64); ICO собираем вручную.
// Установка инструментов и запуск — см. README, раздел "Иконка".
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svgPath = process.argv[2];
const icoPath = process.argv[3];
let svg = readFileSync(svgPath, "utf8");

// resvg не понимает CSS color(display-p3 ...) и не откатывается на hex-фоллбэк (рендерит
// чёрным). Вырезаем эти объявления — рядом всегда есть hex (fill:#... / fill="#..."), он и применится.
svg = svg.replace(/fill:color\(display-p3[^)]*\);?/g, "");

// Логотип имеет 48x46 (не квадрат). Центрируем по вертикали в квадрате 48x48:
// resvg берёт пропорции из width/height корневого <svg>, поэтому правим и их, и viewBox.
svg = svg
  .replace('width="48" height="46"', 'width="48" height="48"')
  .replace('viewBox="0 0 48 46"', 'viewBox="0 -1 48 48"');

const sizes = [256, 128, 64, 48, 32, 24, 16];
const frames = sizes.map((size) => {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: size }, background: "rgba(0,0,0,0)" });
  const img = r.render();
  return { png: Buffer.from(img.asPng()), w: img.width, h: img.height };
});

// ICO: ICONDIR (6) + N * ICONDIRENTRY (16) + PNG-блобы. PNG внутри ICO поддерживается с Vista.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(frames.length, 4);

const dir = Buffer.alloc(16 * frames.length);
let offset = 6 + dir.length;
frames.forEach((f, i) => {
  const e = i * 16;
  dir.writeUInt8(f.w >= 256 ? 0 : f.w, e + 0);
  dir.writeUInt8(f.h >= 256 ? 0 : f.h, e + 1);
  dir.writeUInt8(0, e + 2); // palette
  dir.writeUInt8(0, e + 3); // reserved
  dir.writeUInt16LE(1, e + 4); // color planes
  dir.writeUInt16LE(32, e + 6); // bits per pixel
  dir.writeUInt32LE(f.png.length, e + 8); // size of image data
  dir.writeUInt32LE(offset, e + 12); // offset of image data
  offset += f.png.length;
});

const ico = Buffer.concat([header, dir, ...frames.map((f) => f.png)]);
writeFileSync(icoPath, ico);
console.log(`wrote ${icoPath} (${ico.length} bytes; frames ${frames.map((f) => `${f.w}x${f.h}`).join(", ")})`);
