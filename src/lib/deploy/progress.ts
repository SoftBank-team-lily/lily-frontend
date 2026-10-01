// builder 상태와 로그 → 화면 단계 (STAGES 순서).
// builder: QUEUED → BUILDING(Kaniko) → DEPLOYING(lily-cicd) → 끝.
// DEPLOYING 동안 builder 는 lily-cicd 진행 단계를 "progress: {단계} {내용}" 로 남긴다 (lily-cicd DeployStages)
// 온프레미스는 에이전트 상태를 "agent: {상태} {내용}" 로 남긴다 (lily-builder AgentDeployService)

const LAUNCH = ["started", "database", "color", "migration", "deployment"];
const HEALTH = ["ready", "canary-traffic", "canary-analysis"];
const SWITCH = ["service", "router", "monitor", "scale-down", "succeeded"];
const AGENT: Record<string, number> = { STARTING: 3, HEALTH: 4, JUDGING: 4, SWITCHING: 5 };

export function stageIndex(stage: string | null, logs: string[]): number {
  if (stage === "BUILDING") return 1;
  if (stage !== "DEPLOYING") return 0;
  let index = 2; // 이미지를 올렸고 lily-cicd 가 아직 아무것도 남기지 않았다
  for (const line of logs) {
    const agent = /^agent: (\S+)/.exec(line)?.[1];
    if (agent && AGENT[agent]) index = Math.max(index, AGENT[agent]);
    const step = /^progress: (\S+)/.exec(line)?.[1];
    if (!step) continue;
    if (SWITCH.includes(step)) index = Math.max(index, 5);
    else if (HEALTH.includes(step)) index = Math.max(index, 4);
    else if (LAUNCH.includes(step)) index = Math.max(index, 3);
  }
  return index;
}

/** 화면에 보여 줄 마지막 로그 한 줄. 앞의 분류("progress: ", "build: ")는 뗀다 */
export function lastLine(logs: string[]): string | null {
  const line = logs.at(-1)?.trim();
  if (!line) return null;
  return line.replace(/^(progress|agent): \S+ /, "").slice(0, 200);
}
