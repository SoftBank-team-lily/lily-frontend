import { describe, expect, it } from "vitest";
import {
  manualCloudSelection,
  selectCloud,
  type CloudSelection,
} from "./cloudSelection";

const ai: CloudSelection = {
  id: "ai",
  applies: (input) => input.repo.endsWith("/needs-gcp"),
  choose: () => "GCP",
};

describe("클라우드 선택", () => {
  it("기본은 사용자가 고른 값이다", () => {
    expect(selectCloud({ deploymentMode: "HYBRID", requested: "GCP", repo: "o/r" })).toBe("GCP");
    expect(selectCloud({ deploymentMode: "HYBRID", requested: "AWS", repo: "o/r" })).toBe("AWS");
    expect(selectCloud({ deploymentMode: "HYBRID", repo: "o/r" })).toBe("AWS");
  });

  it("온프레미스 전용은 고른 값과 상관없이 AWS 다", () => {
    expect(selectCloud({ deploymentMode: "ONPREM_ONLY", requested: "GCP", repo: "o/needs-gcp" }, [ai, manualCloudSelection])).toBe("AWS");
  });

  it("앞에 둔 전략이 맡으면 그 결과를 쓰고, 맡지 않으면 사용자 선택으로 내려간다", () => {
    const chain = [ai, manualCloudSelection];
    expect(selectCloud({ deploymentMode: "HYBRID", requested: "AWS", repo: "o/needs-gcp" }, chain)).toBe("GCP");
    expect(selectCloud({ deploymentMode: "HYBRID", requested: "GCP", repo: "o/other" }, chain)).toBe("GCP");
    expect(selectCloud({ deploymentMode: "HYBRID", requested: "AWS", repo: "o/other" }, chain)).toBe("AWS");
  });
});
