import { readFile, mkdir, writeFile } from "node:fs/promises";

const html = await readFile(
  new URL("../docs/reference/landing.html", import.meta.url),
  "utf8",
);
const match = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!match) throw new Error("기준 HTML에 꽃 마스크가 없습니다.");
const png = Buffer.from(match[1], "base64");
if (
  png.readUInt32BE(16) !== 187 ||
  png.readUInt32BE(20) !== 187 ||
  png[24] !== 8 ||
  png[25] !== 0
) {
  throw new Error("꽃 마스크는 187×187 8bit 그레이스케일이어야 합니다.");
}
await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/flower-mask.png", import.meta.url), png);
console.log("꽃 마스크 추출: 187×187");
