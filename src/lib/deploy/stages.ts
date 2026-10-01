// 실제 배포 단계 (lily-builder → lily-cicd). 진행 표시는 realDeploy 가 상태를 보고 채운다
export const STAGES = [
  { name: "레포 확인 중" },
  { name: "빌드 중" },
  { name: "이미지 올리는 중" },
  { name: "새 버전 띄우는 중" },
  { name: "헬스 체크 중" },
  { name: "트래픽 전환 중" },
] as const;
export const REPO_ERROR =
  "owner/repo 형식이나 github.com 주소로 입력해 주세요.";
export const ROLLBACK_MESSAGE =
  "새 버전이 기준을 넘지 못해 트래픽을 이전 버전으로 모두 돌렸어요. 서비스는 계속 정상이에요. 로그에서 원인을 확인한 뒤 다시 배포해 주세요.";
