# AI 코드 수정 진행 표시 계획

작성일: 2026-10-03. 이 문서는 구현 계획이며, 진행 표시 기능은 아직 구현하지 않았습니다.

## 1. 목표

배포 화면의 맨 아래에 **AI 수정 진행** 패널을 추가합니다. 코드 장애를 발견했을 때 무엇을 확인하고, 어느 파일의 수정안을 만들고, 어떤 검사까지 마쳤는지 보여 줍니다. Groq 호출과 GitHub 작업은 서버에서 실행하고 화면은 저장된 작업 상태를 읽습니다.

기본 흐름은 **장애 감지 → 원인 확인 → 수정안 생성 → diff 검사 → PR 생성 → 사용자 검토**입니다. 현재 코드에 없는 자동 머지·자동 적용을 완료된 기능처럼 표시하지 않습니다.

## 2. 확인한 현재 구현

아래는 코드 확인 결과입니다. 운영 클러스터에서 기능이 켜져 있는지는 별도 확인이 필요합니다.

| 위치 | 현재 구현 | 표시 기능에 필요한 변경 |
| --- | --- | --- |
| frontend `main`, `39be866` | 배포 상태를 3초마다 조회. 실행기가 builder 로그 마지막 40줄을 저장하며 랜딩에는 마지막 한 줄 표시 | 수정 작업 이력 조회 및 하단 패널 추가 |
| frontend `develop`, `f7cf336` | 사건 수신, 프로젝트 동의·GitHub App·배포 커밋 확인, builder에 초안 요청, 수정 브랜치와 PR 생성, `remediation_prs`에 최종 결과 저장 | main 통합, 작업 시작부터 단계별 상태 저장 |
| builder 로컬 `feature/ai-diagnosis`, `495ce4f` | Groq 키가 있으면 `AiPatchModel`이 diff 생성. `RemediateDraftService`가 소스 조회·코드 장애 판정·diff 검사 후 결과 반환 | 진행 조회가 가능한 비동기 작업과 단계 기록 |
| observer 로컬 `feature/ai-diagnosis`, `905e2ed` | 연속 CRITICAL 상태에서 런타임 로그의 예외·파일을 추출해 frontend 사건 API로 전달 | 작업 ID 연결, 접수 결과와 재시도 구분 |

확인한 핵심 소스:

- [frontend 수정 흐름](https://github.com/SoftBank-team-lily/lily-frontend/blob/f7cf33617fd16040041e7736e9717aee9bdb5023/src/lib/remediate/flow.ts), [사건 수신·결과 저장](https://github.com/SoftBank-team-lily/lily-frontend/blob/f7cf33617fd16040041e7736e9717aee9bdb5023/src/lib/remediate/accept.ts), [PR 생성](https://github.com/SoftBank-team-lily/lily-frontend/blob/f7cf33617fd16040041e7736e9717aee9bdb5023/src/lib/remediate/github-pr.ts)
- [builder 초안 처리](https://github.com/SoftBank-team-lily/lily-builder/blob/495ce4f2698275ffdd7f4ef260c1f4e931dedaf3/src/main/java/com/lily/builder/RemediateDraftService.java), [Groq 호출](https://github.com/SoftBank-team-lily/lily-builder/blob/495ce4f2698275ffdd7f4ef260c1f4e931dedaf3/src/main/java/com/lily/builder/AiPatchModel.java)

### 통합 시 먼저 해결할 점

1. 현재 코드 수정 흐름은 **배포 후 런타임 장애**를 대상으로 합니다. 빌드·컴파일 실패에도 적용하려면 `buildId`와 실패한 소스 커밋을 받는 별도 사건 진입점을 추가해야 합니다.
2. 프런트 main의 설정 자동 수정·재배포와 Groq의 코드 수정 PR은 별개입니다. 원인 유형을 구분하고 같은 실패에서 두 작업이 동시에 시작되지 않게 합니다.
3. develop의 `007`~`009` SQL은 main의 같은 번호 SQL과 내용이 다릅니다. 번호 그대로 합치지 않고 다음 사용 가능한 번호로 옮긴 뒤 이미 적용된 DB를 기준으로 통합합니다.
4. 현재 builder 초안 API는 동기 호출이며 최종 `draft/off/rejected`만 반환합니다. 화면만 붙이면 “생성 중” 이상을 알 수 없으므로 단계 데이터가 먼저 필요합니다.
5. 현재 Groq 호출 실패는 빈 diff로 합쳐집니다. 키 없음·제한 초과·시간 초과·유효한 수정안 없음은 사용자에게 구분해 전달할 수 있도록 결과 타입을 확장합니다.
6. 현재 PR 결과 테이블만으로는 진행 중 작업·프로세스 중단·GitHub 생성 후 DB 저장 실패를 복구할 수 없습니다. 작업을 먼저 저장하고 GitHub 결과와 연결합니다.

## 3. 화면 구성

랜딩의 `DeployStatus`와 결과 버튼 **아래**, 같은 콘텐츠 흐름에 `FixProgress`를 배치합니다. 고정된 하단 오버레이는 사용하지 않습니다. 작업이 없으면 패널을 생략하고 기능이 꺼진 이유는 사용자가 요청했을 때 표시합니다.

```text
배포 진행 / 결과
[다시 배포하기]

AI 수정 진행                       수정안 생성 중
✓ 장애 확인     NullPointerException 발견
✓ 파일 확인     src/main/java/.../PostService.java:42
● 수정안 생성   해당 파일의 수정안을 만들고 있어요
○ diff 검사
○ PR 생성

최근 작업
12:31 장애 로그와 배포 커밋을 확인했어요
12:32 PostService.java의 수정안을 생성하고 있어요

[변경 내용 보기]   [GitHub PR 보기]
```

- 상단: 현재 단계, 대상 커밋, 경과 시간. 진행률 숫자는 제공하지 않습니다.
- 단계 목록: 완료·진행·실패·검토 대기를 구분합니다. 실패한 단계에는 이유와 다음 행동을 표시합니다.
- 변경 내용: 파일 경로, 추가·삭제 줄 수, 실제 diff에서 확인한 수정 요약. 생성된 추론 과정이나 프롬프트를 표시하지 않습니다.
- 모델 생성과 diff 검사를 통과해도 “수정 완료” 대신 **수정 PR 생성 · 검토 대기**로 표시합니다. diff 적용 검사는 컴파일·테스트 통과를 의미하지 않습니다.
- 빌드·테스트 결과가 실제로 수집된 경우에만 각각 별도 완료 항목으로 표시합니다.
- 한국어·영어·일본어는 현재 i18n을 재사용합니다. 상태 코드와 파라미터를 번역하고 파일명·커밋·실제 로그는 원문을 유지합니다.
- 갱신 시 강제 스크롤이나 포커스 이동을 하지 않습니다. 상태 문구에 `aria-live="polite"`를 적용하고 로그 전체를 반복 낭독하지 않습니다.
- 모바일에서는 단계와 요약을 세로로 표시하고 diff는 접어 둡니다.

배포 후 발생한 장애도 볼 수 있도록 `/account` 프로젝트 카드에서 같은 컴포넌트를 재사용합니다. 대시보드의 최근 작업 영역에서도 같은 조회 API를 사용합니다. **정육각형 배치의 여섯 패널 수는 유지**하고 일곱 번째 공간 패널을 추가하지 않습니다.

## 4. 상태와 데이터 계약

작업 단계를 배포의 6단계 진행률과 분리합니다. PR을 만드는 동안 기존 앱은 정상 운영 중일 수도 있으므로 배포 성공 상태를 코드 수정 상태로 덮어쓰지 않습니다.

### 제안 타입

```ts
type FixStage =
  | "queued" | "analyzing" | "reading" | "generating"
  | "checking" | "opening-pr" | "review";
type FixStatus = "running" | "review" | "skipped" | "failed";

type FixRun = {
  id: string;
  projectId: string;
  deploymentId: string;
  buildId: string | null;
  trigger: "runtime" | "build";
  status: FixStatus;
  stage: FixStage;
  revision: number;
  sourceCommit: string;
  provider: "groq" | "anthropic" | "openai" | null;
  reasonCode: string | null;
  files: { path: string; added: number; removed: number }[];
  prUrl: string | null;
  startedAt: string;
  updatedAt: string;
};
```

위 타입은 새 계약의 제안입니다. `provider`는 실제 사용한 모델 제공자를 기록해 Groq 외의 모델을 사용한 작업도 “Groq가 수정 중”으로 잘못 표시하지 않도록 합니다.

- `fix_runs`: 작업의 현재 상태, 원래 배포·커밋, builder job ID, PR ID, heartbeat, 종료 시간을 영속 저장합니다.
- `fix_events`: `runId`, `sequence`, `stage`, `code`, `params`, `at`를 추가 방식으로 저장합니다. 연번을 중복 제외와 재조회에 사용합니다.
- `remediation_prs`: 기존 PR 결과를 유지하고 작업 ID와 연결합니다. 구현 시 main/develop의 기존 SQL과 정합성을 확인합니다.
- 원시 프롬프트·토큰·전체 소스를 진행 API에 포함하지 않습니다. 로그·요약·diff는 서버에서 마스킹하고 조회 범위를 프로젝트 소유자에게 제한합니다.
- 사건 중복은 `projectId + sourceCommit + signature`를 기준으로 방지합니다. 저장소의 같은 PR을 웹훅으로 다시 인식해 새 수정 작업을 만드는 반복도 차단합니다.
- PR 생성과 저장이 중간에 끊기면 기존 브랜치·PR을 조회해 복구합니다. 프로세스 재시작 후에도 영원히 “수정 중”으로 남지 않도록 lease와 heartbeat 기준을 둡니다.

## 5. 연결 방식

1. observer 사건 또는 빌드 실패를 서버에서 프로젝트·배포·커밋에 연결합니다. `fix_runs`를 저장하고 접수 ID를 반환합니다.
2. 서버 작업자가 builder에 초안 작업을 요청합니다. builder는 작업 ID를 반환하고 내부에서 파일 조회·모델 호출·diff 검사를 수행합니다.
3. builder는 각 단계와 제한된 결과 코드를 작업 저장소에 남깁니다. frontend 작업자는 내부 조회 API로 상태를 수집합니다.
4. 유효한 diff가 준비되면 기존 frontend GitHub App 코드로 PR을 생성합니다. `review`로 종료하며 PR 주소를 저장합니다.
5. 브라우저는 소유권을 확인하는 `GET /api/projects/:id/fixes?after=<sequence>`로 상태를 조회합니다. 최초에는 최근 작업과 이력, 이후에는 현재 상태와 새 이벤트를 반환합니다.

**초기 전송은 기존 구조에 맞춰 3초 폴링**을 사용합니다. 변경이 없으면 revision 기준으로 화면 업데이트를 생략하고, 탭이 숨겨지면 간격을 늘립니다. 작업 종료 후 폴링을 멈춥니다. 새로고침·네트워크 재연결 시 저장된 작업을 복원합니다. 이벤트 규모가 커지면 같은 계약을 SSE로 확장합니다.

현재 동기 API를 유지해야 하는 1차 시연에서는 “수정안 생성·검사 중”을 하나의 단계로 표시할 수 있습니다. 파일별 생성 상황이나 검사 시작을 타이머로 연출하지 않습니다. **상세 단계 표시는 builder 비동기 작업 구현 이후에 연결**합니다.

기존 `realDeploy`는 배포가 끝나면 조회를 멈추므로 런타임 수정 작업을 관측하지 못합니다. `useFixProgress`는 별도 수명주기를 가지며 배포 결과와 프로젝트 ID를 넘겨받습니다. 재배포로 `latestDeployment`가 바뀌어도 원래 수정 작업 이력은 보존합니다.

## 6. 작업 분류와 순서

| ID | 저장소 | 작업 | 완료 기준 | 의존 |
| --- | --- | --- | --- | --- |
| F1 | frontend | develop의 GitHub App·remediate 흐름 통합 계획 확정 및 병합, SQL 번호 충돌 해결, 커밋 SHA 전달 확인 | 기존 배포·가입 기능과 함께 사건→PR 경로가 사용 가능 | — |
| F2 | frontend·builder | 상태 계약과 `fix_runs/fix_events` 저장, 사건 중복 방지 | 시작·진행·종료 상태가 새로고침 후에도 남음 | F1 |
| F3 | builder | 비동기 초안 작업, 단계 기록, Groq 실패 코드·provider 반환 | 분석/파일 조회/생성/검사를 실제 실행 시점에 구분 가능 | F2 |
| F4 | frontend·observer | 사건 접수/작업 수집/PR 생성 연결, 재시작·부분 실패 복구 | 중복 PR 없이 검토 대기 또는 실패로 종료 | F2, F3 |
| F5 | frontend | 소유자별 조회 API, `useFixProgress`, 하단 `FixProgress` | 배포 진행·완료·실패 화면에서 실제 수정 상태 표시 | F4 |
| F6 | frontend·dashboard | 계정/대시보드 재사용, i18n, 접근성, 모바일 | 런타임 장애 진행도 볼 수 있고 기존 6개 패널 유지 | F5 |
| F7 | 연동 | 정상/실패/재연결 검증 및 운영 설정 문서 | 아래 검증 시나리오 충족 | F6 |
| F8 | builder·frontend | 빌드·컴파일 실패에 같은 흐름 연결 | 실패한 buildId·커밋·rootDir 기준으로 수정안 생성 | F7 |

권장 구현 브랜치: 각 해당 저장소의 `feature/ai-progress`. F8은 후속 범위이며 F1~F7 완료만으로 빌드 실패 자동 코드 수정까지 지원한다고 표기하지 않습니다. 작업별 커밋을 완료한 뒤 다음 작업으로 진행합니다.

## 7. 검증 계획

- **정상:** 테스트 저장소의 코드 장애 → 실제 Groq diff → 적용 검사 → PR 생성. 단계 순서, 변경 파일, PR 링크가 일치해야 합니다.
- **미수정:** 코드 원인이 아닌 장애·레포 프레임 없음 → 건너뜀과 이유 표시. PR을 만들지 않습니다.
- **모델 실패:** 키 미설정·429·시간 초과·빈/잘못된 diff → 실제 이유에 맞는 종료 상태. 성공 메시지를 표시하지 않습니다.
- **GitHub 실패:** 설치 권한 없음·커밋 불일치·브랜치 충돌·PR 생성 직후 저장 실패 → 안전한 재조회와 중복 방지 확인.
- **권한:** 다른 사용자 프로젝트·작업·diff 조회 불가. 모델 키와 GitHub 토큰이 응답·브라우저에 노출되지 않아야 합니다.
- **수명주기:** 새로고침·일시 단절·작업자 재시작·새 배포 시작 후에도 기존 수정 이력이 남습니다.
- **표시:** 한국어·영어·일본어, 모바일, 읽기 도중 이벤트 추가, 배포 완료 후 런타임 사건 표시 확인.
- **동시성:** 설정 자동 재배포와 코드 수정이 같은 실패를 두 번 처리하지 않아야 합니다.

실제 PR 생성 검증은 임시 테스트 저장소·프로젝트를 사용합니다. 배포 중 코드 변경을 즉시 반영하거나 자동 머지하는 기능은 이번 진행 표시 구현과 별도 계획으로 둡니다.
