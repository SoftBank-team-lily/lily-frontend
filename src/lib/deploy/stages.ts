export const STAGES = [
  { name: "레포 확인 중", duration: 1200 },
  { name: "빌드 중", duration: 3200 },
  { name: "이미지 올리는 중", duration: 1600 },
  { name: "트래픽 10%로 새 버전 내보내는 중", duration: 2200 },
  { name: "에러율·응답 시간 판정 중", duration: 2600 },
  { name: "트래픽 100%로 전환 중", duration: 1600 },
] as const;
export const STEPS = 12;
export const FAILURE_STAGE = 4;
export const FAILURE_STEP = 7;
export const ROLLBACK_DELAY = 1400;
export const REDUCED_DELAY = 300;
export const REPO_ERROR = "owner/repo 형식이나 github.com 주소로 입력해 주세요.";
export const ROLLBACK_MESSAGE = "새 버전의 에러율이 기준(2%)을 넘어서 트래픽을 이전 버전으로 모두 돌렸어요. 서비스는 계속 정상이에요. 로그에서 원인을 확인한 뒤 다시 배포해 주세요.";
