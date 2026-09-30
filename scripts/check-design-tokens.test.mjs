import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations } from "./check-design-tokens.mjs";

test("색상 리터럴과 팔레트 사용을 거부한다", () => {
  for (const source of [
    "bg-[#fff]",
    "rgb(1 2 3)",
    "vec3(0.1, 0.2, 0.3)",
    "bg-red-500",
    "border-ink/18",
    "const color = [0.93, 0.66, 0.24]",
    "pink: [0.9, 0.33, 0.5]",
  ]) {
    assert.equal(findViolations(source).length, 1, source);
  }
});
test("의미 토큰과 비색상 값을 허용한다", () => {
  for (const source of [
    "bg-surface text-ink",
    "new Color().setRGB(...surface)",
    "pt-[52vh]",
    "vec3(position, 1.0)",
  ]) {
    assert.equal(findViolations(source).length, 0, source);
  }
});
