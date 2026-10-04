import type { CloudProvider, DatabaseChoice, DeploymentMode } from "./types";

/**
 * 하이브리드 클라우드를 고를 때 넘기는 재료.
 * 수동 전략은 requested 만 쓴다. 이후 AI 전략은 repo·폴더·DB 를 볼 수 있다.
 */
export type CloudSelectionInput = {
  deploymentMode: DeploymentMode;
  /** 화면에서 사용자가 고른 클라우드. 비우면 AWS */
  requested?: CloudProvider;
  repo: string;
  rootDir?: string;
  database?: DatabaseChoice;
};

/**
 * 클라우드를 하나 고른다. 고른 값은 projects.cloud_provider 에 고정되고 배포는 그 값을 따른다.
 * 신규 자동 선택은 server.ts 에서 cloudAutomatic.ts 의 비동기 builder 호출을 사용한다.
 * 이 인터페이스는 수동·기존 전략 호환용이다.
 * applies 가 false 면 다음 전략으로 넘어간다.
 */
export type CloudSelection = {
  id: string;
  applies(input: CloudSelectionInput): boolean;
  choose(input: CloudSelectionInput): CloudProvider;
};

/** 사용자가 고른 값. 비우면 AWS */
export const manualCloudSelection: CloudSelection = {
  id: "manual",
  applies: () => true,
  choose(input) {
    return input.requested === "GCP" || input.requested === "MULTI" ? input.requested : "AWS";
  },
};

/**
 * 앞에 있을수록 먼저 본다. 수동은 항상 마지막이라 빠지지 않는다.
 * AI 를 꽂을 때는 이 배열에서 manualCloudSelection 보다 앞에 둔다.
 * AI 의 applies 는 그 파이프라인이 켜져 있을 때만 true 다.
 */
export const strategies: CloudSelection[] = [manualCloudSelection];

/** 온프레미스 전용은 클라우드가 없으므로 AWS 다. 그 외에는 앞선 전략이 고른다 */
export function selectCloud(
  input: CloudSelectionInput,
  chain: readonly CloudSelection[] = strategies,
): CloudProvider {
  if (input.deploymentMode === "ONPREM_ONLY") return "AWS";
  const strategy = chain.find((item) => item.applies(input)) ?? manualCloudSelection;
  const chosen = strategy.choose(input);
  return chosen === "GCP" || chosen === "MULTI" ? chosen : "AWS";
}
