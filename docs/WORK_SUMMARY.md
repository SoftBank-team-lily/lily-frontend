# 작업 공유: 프런트·대시보드·AI 진단

작성일: 2026-10-03. 소스코드를 열어 설명할 때 사용할 발표 순서와 전달 문구입니다.
프런트 `b86545c`, 대시보드 `535ce2a`, builder 진단 브랜치 `495ce4f`, observer 진단 브랜치 `905e2ed`를 기준으로 작성했습니다.
작성 중에도 팀원 커밋이 추가될 수 있으므로 전체 최신 기능 목록보다는 이번 작업의 책임과 연결 지점을 설명합니다.

## 1. 먼저 전달할 요약

> 제가 작업한 부분은 Lily의 랜딩과 꽃 인터랙션, 계정·사용자별 프로젝트 관리, 실제 관측 서비스와 대시보드 연결입니다. 프런트와 대시보드에 한국어·영어·일본어 설정도 적용했습니다. 최근에는 대시보드 패널을 원하는 배치로 옮기고, 사용자가 직접 드래그할 수 있게 수정했습니다. AI 쪽에서는 observer의 관측 근거를 builder의 JEV 진단 API에 전달하는 기능을 추가했고, Groq 코드 수정 과정을 배포 화면 하단에 표시하는 후속 작업은 계획 문서로 정리했습니다.

### 작업 구분

| 구분 | 내용 | 상태 |
| --- | --- | --- |
| 직접 구현 | Next.js 랜딩·공통 UI·three.js 꽃과 배포 상태 연출 | 구현 |
| 직접 구현 | 꽃술 카메라 확대, 대시보드 진입 상태와 실패 시 복귀 | 구현 |
| 직접 구현 | 인증 UI·Better Auth 서버 설정·계정 관리·사용자별 프로젝트/배포 API | 구현 |
| 연동 구현 | 프로젝트 소유권·배포 기록의 appName을 기준으로 내부 관측 서비스와 대시보드 연결 | 구현 |
| 직접 구현·팀 기능 연동 | HOME/AWS 거점 및 트래픽 제어 UI를 대시보드로 옮겨 기존 서버 API에 연결 | 구현, 일부 거점 지표는 미수집 |
| 직접 구현 | 프런트·대시보드 i18n과 언어 선택 유지 | 구현 |
| 직접 구현 | 패널 기본 배치·드래그·방향키 이동·배치 초기화 | 구현 |
| 직접 구현 | observer 근거 수집·캐시·동시 요청 병합, builder JEV 원인 후보 진단 | feature 브랜치 구현 |
| 설계 | Groq 코드 수정 진행 표시와 이력·조회 API·연동 태스크 | 계획 문서, UI/API 미구현 |

## 2. 발표 순서와 보여 줄 소스

### A. 랜딩과 꽃을 통한 대시보드 진입

**보여 줄 파일**

- [LandingPage.tsx](../src/components/landing/LandingPage.tsx): 배포 폼, 배포 상태, 꽃과 진입 상태 조합.
- [FlowerScene.ts](../src/lib/three/flower/FlowerScene.ts): 파티클 꽃 렌더링, 배포에 따른 목표값, 꽃술 카메라 확대·페이드·복귀.
- [useDashboardEntry.ts](../src/lib/hooks/useDashboardEntry.ts): 권한 확인부터 화면 전환까지의 상태 관리.
- [projects/server.ts](../src/lib/projects/server.ts): `getProjectEntry`의 소유권·배포 성공 검사.

**설명 문구**

> 꽃은 배포 진행 상태를 보여주는 진입 UI입니다. 정상 배포된 프로젝트에 대해서만 대시보드 진입을 허용합니다. 클릭하면 권한을 먼저 확인하고, 꽃술로 확대되는 연출이 끝난 뒤 프로젝트 ID를 전달해 대시보드로 이동합니다. 권한 확인이나 이동이 실패하면 화면으로 복귀하도록 처리했습니다.

**핵심 코드: 진입 가능한 배포 제한**

```ts
const result = await getProject(ownerId, id);
if (result.latestDeployment?.status !== "succeeded")
  throw new ApiError(
    409,
    "NOT_DEPLOYED",
    "정상 배포가 완료된 프로젝트만 열 수 있어요.",
  );
```

`getProjectEntry`의 실제 코드입니다. 권한 검사와 애니메이션은 별도 책임을 가지며, 서버 검사 결과가 진입을 결정합니다.

### B. 로그인·계정·사용자별 프로젝트 관리

**보여 줄 파일**

- [auth/server.ts](../src/lib/auth/server.ts): Better Auth, PostgreSQL 저장, 세션·비밀번호 복구 설정.
- [LoginForm.tsx](../src/components/auth/LoginForm.tsx), [SignupForm.tsx](../src/components/auth/SignupForm.tsx): 인증 화면.
- [projects/server.ts](../src/lib/projects/server.ts): 프로젝트·배포 기록 생성 및 소유권 조회.
- [API.md](API.md): 인증·프로젝트 API 계약.

**설명 문구**

> 인증은 Better Auth를 사용해 서버와 DB에 연결했습니다. 계정과 세션을 로컬 UI 상태에만 저장하는 방식이 아니라 서버 세션을 사용합니다. 프로젝트 API에서는 세션의 사용자 ID로 소유자를 결정하고, 상세 조회·수정·대시보드 진입에도 같은 소유권 검사를 적용했습니다.

**핵심 코드: 프로젝트와 소유자 함께 조회**

```ts
const result = await db.query<Row>(
  `${selectProject} WHERE p.id=$1 AND p.owner_id=$2`,
  [id, ownerId],
);
if (!result.rows[0])
  throw new ApiError(404, "NOT_FOUND", "프로젝트를 찾을 수 없어요.");
```

`projectRow`의 실제 코드입니다. 프런트 버튼을 숨기는 것과 별개로 서버에서도 다른 사용자 프로젝트에 접근하지 못하도록 제한합니다.

**현재 범위:** 초기 구현은 이메일·비밀번호 기반입니다. 별도 사용자 아이디 방식으로 전환한 기능까지 구현했다고 설명하지 않습니다. 이메일 인증 정책 변경은 팀의 후속 변경과 함께 확인해야 합니다.

### C. 실제 관측 API와 대시보드 연결

**보여 줄 파일**

- [monitor/server.ts](../src/lib/monitor/server.ts): `getMonitor`, 서비스별 조회·응답 검사·비밀값 마스킹.
- [프로젝트 모니터 API](../src/app/api/projects/[id]/monitor/route.ts): 사용자 세션과 입력 검사.
- [대시보드 ProjectDashboard.tsx](https://github.com/SoftBank-team-lily/lily-monitoring-dashboard/blob/535ce2ab34cdd571dec0bdcbe6976ef999c32c2d/components/ProjectDashboard.tsx): 실프로젝트의 데이터 조회와 패널 구성.
- [대시보드 frontend.ts](https://github.com/SoftBank-team-lily/lily-monitoring-dashboard/blob/535ce2ab34cdd571dec0bdcbe6976ef999c32c2d/lib/frontend.ts): 프런트 서버로 세션 쿠키를 전달하는 연결 계층.

**설명 문구**

> 화면에서 임의의 앱 이름을 받아 내부 서비스를 조회하지 않고, 사용자가 소유한 프로젝트 ID에서 실제 배포 appName을 찾습니다. 그 이름으로 observer의 상태·지표·파드·로그, ingress의 라우트, provisioner의 DB 상태를 조회해 대시보드에 전달합니다. 서비스가 연결되지 않았거나 데이터를 수집하지 못한 경우도 별도 상태로 표시합니다.

**실제 연결 흐름**

```text
대시보드 /dashboard?project=<UUID>
  → 대시보드 서버의 모니터 API
  → 프런트 /api/projects/:id/monitor
  → 세션·프로젝트 소유권 확인
  → 배포 기록에서 appName 확인
  → observer / ingress / provisioner 조회
  → 검증·마스킹된 결과를 패널에 표시
```

코드에서는 내부 토큰과 URL을 서버에 보관하고, 서비스별 조회를 병렬 실행합니다. 최근 배포 시도 결과와 현재 실행 중인 앱 상태, 빌드 로그와 실행 로그를 구분했습니다. 대시보드는 배포 중 5초, 평상시 15초 간격으로 갱신합니다.

### D. 거점·트래픽 관리 UI

**보여 줄 파일**

- [대시보드 TrafficPanel.tsx](https://github.com/SoftBank-team-lily/lily-monitoring-dashboard/blob/535ce2ab34cdd571dec0bdcbe6976ef999c32c2d/components/TrafficPanel.tsx): HOME/AWS 상태, 거점 전환, 자동·수동 버스팅과 비율 입력.
- [대시보드 control API](https://github.com/SoftBank-team-lily/lily-monitoring-dashboard/blob/535ce2ab34cdd571dec0bdcbe6976ef999c32c2d/app/api/projects/%5Bid%5D/control/route.ts): 프런트의 기존 제어 API로 연결.

**설명 문구**

> 인프라 팀이 구현한 거점 전환과 버스팅 API를 대시보드에서 조작할 수 있게 연결했습니다. HOME과 AWS 상태를 한 화면에서 확인하고, 자동 모드와 수동 트래픽 비율을 선택할 수 있습니다. 계정 화면에 있던 제어 UI는 대시보드로 옮겼습니다.

**표시 범위:** 현재 거점별 CPU·RAM·p95를 제공하는 API가 없어 해당 값은 미수집으로 표시합니다. 데모 수치를 실제 관측값처럼 설명하지 않습니다. 트래픽 제어 엔진이나 인프라 전환 로직 자체를 신규 구현한 작업으로 소개하지 않습니다.

### E. 한국어·영어·일본어 설정

**보여 줄 파일**

- [LanguageMenu.tsx](../src/components/i18n/LanguageMenu.tsx): 로그인·회원가입 영역의 언어 선택 메뉴.
- [i18n/provider.tsx](../src/lib/i18n/provider.tsx): 언어 변경과 쿠키 저장.
- [i18n/config.ts](../src/lib/i18n/config.ts), [proxy.ts](../src/proxy.ts): 기본 한국어, 앱 간 언어 전달.
- [영어 사전](../src/lib/i18n/en.json), [일본어 사전](../src/lib/i18n/ja.json), [i18n.md](i18n.md): 번역 추가 방식.

**설명 문구**

> i18next와 react-i18next로 두 앱에 동일한 언어 선택 기능을 추가했습니다. 기본값은 한국어이며 변경한 언어를 쿠키에 저장합니다. 같은 주소에서는 쿠키를 공유하고, 다른 주소로 이동할 때는 lang 파라미터로 전달합니다. 프로젝트명·실제 로그·API 필드명은 원문을 유지합니다.

**핵심 코드: 언어 변경**

```ts
document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
updateLocale(next);
void i18n.changeLanguage(next);
document.documentElement.lang = next;
router.refresh();
```

`LanguageProvider`의 실제 코드입니다. 계정 DB 설정이 아니라 브라우저별 언어 설정입니다.

### F. 대시보드 패널 배치와 드래그

**보여 줄 파일**

- [ParticleStage.tsx](https://github.com/SoftBank-team-lily/lily-monitoring-dashboard/blob/535ce2ab34cdd571dec0bdcbe6976ef999c32c2d/components/ParticleStage.tsx): `PANEL_PLACES`, `movePanel`, `startDrag`, `dragKey`, `updateConnections`, `resetPanels`.
- [dashboard.module.css](https://github.com/SoftBank-team-lily/lily-monitoring-dashboard/blob/535ce2ab34cdd571dec0bdcbe6976ef999c32c2d/components/dashboard.module.css): 이동 손잡이·포커스·접점 스타일.

**설명 문구**

> 첨부한 화면 배치를 기본 3D 좌표에 반영했고, 각 패널 상단 제목을 잡아 이동할 수 있게 했습니다. 마우스의 픽셀 이동을 카메라와 같은 3D 좌표계로 변환해 위치를 저장합니다. 드래그 중에는 배경 카메라 조작을 멈추고, 연결선은 꽃을 향한 패널 가장자리에 다시 붙도록 계산합니다.

**핵심 코드: 픽셀 이동을 패널 좌표로 변환**

```ts
const depth = -dragDepth.copy(panel.object.position).applyMatrix4(camera.matrixWorldInverse).z;
const unitsPerPixel = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
const overviewScale = camera.position.distanceTo(orbit.target) / initialCamera.distanceTo(initialTarget);
dragInverse.copy(camera.quaternion).multiply(initialOrientationInverse).invert();
dragDelta.set(dx, -dy, 0).multiplyScalar(unitsPerPixel / overviewScale)
  .applyQuaternion(camera.quaternion).applyQuaternion(dragInverse);
panel.offset.add(dragDelta);
```

`movePanel`의 실제 코드입니다. CSS transform을 직접 덮어쓰는 대신 렌더링에 사용하는 좌표를 변경합니다.

추가 동작:

- 제목 손잡이에 포커스를 두고 방향키로 이동. Shift와 함께 누르면 큰 폭으로 이동.
- 패널 배치 초기화와 카메라 시점 초기화를 구분.
- 상세 확대 중에는 이동을 잠시 막아 카메라 전환과 충돌 방지.
- 데스크톱 공간 보기에서 사용. 모바일/목록 보기는 기존 흐름 유지.
- 이동 위치는 현재 화면에서 유지. 새로고침 시 이미지에 맞춘 기본 배치로 복귀.

### G. observer·builder의 JEV 진단

**보여 줄 파일**

- [observer DiagnosisCollector.java](https://github.com/SoftBank-team-lily/lily-observer/blob/905e2eda077dc90a41e7999c286b27aaf703cb87/src/main/java/com/lily/observer/diagnosis/DiagnosisCollector.java): 지표·파드·로그 등 관측 근거 수집.
- [observer DiagnosisService.java](https://github.com/SoftBank-team-lily/lily-observer/blob/905e2eda077dc90a41e7999c286b27aaf703cb87/src/main/java/com/lily/observer/diagnosis/DiagnosisService.java): 같은 앱의 동시 요청 병합과 결과 캐시.
- [builder DiagnosisService.java](https://github.com/SoftBank-team-lily/lily-builder/blob/495ce4f2698275ffdd7f4ef260c1f4e931dedaf3/src/main/java/com/lily/builder/DiagnosisService.java): JEV 후보 선택·확신도 검증·규칙 대체.
- [builder diagnosis.md](https://github.com/SoftBank-team-lily/lily-builder/blob/495ce4f2698275ffdd7f4ef260c1f4e931dedaf3/docs/diagnosis.md): API 계약과 로컬 연결 방법.

**설명 문구**

> 운영 중인 앱의 관측 근거를 모아 원인 후보를 고르는 JEV 진단 API를 추가했습니다. observer가 자료를 수집하고 builder가 허용된 후보 중 하나를 선택합니다. 답의 선택지와 확신도를 검증하고, 키 미설정이나 모델 실패 시에는 규칙 기반 결과를 반환합니다. 같은 앱의 요청을 합치고 성공 30초·실패 5초 캐시를 사용해 중복 호출을 줄였습니다.

**구현 범위:** 진단 결과와 근거 ID·검토 조치를 반환합니다. PR 생성·배포·트래픽 변경·롤백은 실행하지 않습니다. 대시보드의 신규 진단 패널까지 연결한 상태로 소개하지 않습니다. 두 모듈은 `feature/ai-diagnosis` 기준이며 원격 main 적용은 별도입니다.

### H. Groq 코드 수정 진행 표시 계획

**보여 줄 파일:** [AI_PROGRESS.md](AI_PROGRESS.md).

**설명 문구**

> 팀원이 구성한 observer 사건 수집 → builder의 Groq 수정안 생성 → frontend의 수정 PR 생성 흐름을 확인했습니다. 이 과정을 배포 화면 하단에서 볼 수 있도록 작업 상태·이벤트 저장, 소유자별 조회 API, 진행 타임라인을 설계했습니다. 생성 중·diff 검사·PR 생성·검토 대기를 구분하고, 실제로 확인된 단계만 표시하는 방향입니다.

계획의 순서는 F1 기존 흐름 통합, F2 상태 저장, F3 builder 비동기 처리, F4 사건·PR 연결, F5 하단 UI, F6 계정·대시보드 재사용, F7 연동 검증, F8 빌드 실패 확장입니다.

**현재 상태:** 계획 문서만 작성했습니다. 하단 진행 UI와 신규 상태 API는 아직 구현하지 않았습니다. 팀원의 `AiPatchModel`, `RemediateDraftService`, 기존 수정 PR 생성 로직은 이번 직접 구현 내역과 구분합니다.

## 3. 5분 발표용 진행 순서

| 시간 | 보여 줄 화면·코드 | 전달할 내용 |
| --- | --- | --- |
| 0:00~0:40 | 랜딩, FlowerScene, useDashboardEntry | 꽃 연출과 권한 확인 후 대시보드 진입 |
| 0:40~1:20 | auth/server, projectRow | 서버 세션과 사용자별 프로젝트 접근 |
| 1:20~2:10 | getMonitor, ProjectDashboard, TrafficPanel | 실제 서비스 연결과 기존 인프라 제어 API 재사용 |
| 2:10~2:40 | 지구본 메뉴, LanguageProvider | 두 앱의 언어 선택과 설정 전달 |
| 2:40~3:30 | 패널 드래그, movePanel, resetPanels | 이미지 기본 배치, 이동 좌표 변환, 연결선 갱신 |
| 3:30~4:20 | observer/builder DiagnosisService | 근거 기반 JEV 진단과 캐시·요청 병합 |
| 4:20~5:00 | AI_PROGRESS | Groq 진행 표시 후속 계획과 남은 연결 작업 |

## 4. 팀원 작업과 구분해서 설명할 부분

- 실제 배포 실행기, Dockerfile 자동 생성, 배포 설정 자동 수정·재배포, Groq 수정안 생성과 PR 엔진은 팀 구현을 활용한 부분입니다.
- 스키마 이력 패널과 온프레미스 프로젝트 삭제 수정도 팀원 작업입니다. main 통합 과정에서 함께 반영했으며 직접 신규 구현한 기능으로 소개하지 않습니다.
- JEV 운영 진단과 Groq 코드 수정은 다른 흐름입니다. 전자는 원인 후보와 검토 조치를 반환하고, 후자는 코드 diff와 수정 PR을 만드는 흐름입니다.
- 정육각형 배치를 시도했던 변경은 되돌렸습니다. 최종 결과는 첨부 이미지의 기본 배치와 드래그 기능입니다.
- 빌드·타입 검사 통과와 실제 운영 연결 성공은 구분합니다. 최근 대시보드 드래그 구현의 빌드·타입 검사는 통과했으며, 운영 연결 상태는 서비스 URL·토큰·클러스터 설정에 따라 확인해야 합니다.

## 5. 관련 커밋

| 작업 | 저장소 | 주요 커밋 |
| --- | --- | --- |
| 계정·프로젝트 API | frontend | `649f8a2`, `bd080ac`, `e9f4aec` |
| 꽃술 진입 연출 | frontend | `f7cc9b1`, `00e95ff`, `4c4c4e3` |
| 실제 관측·대시보드 연결 | frontend / dashboard | `d5cbe41`, `2835da6` / `6c77c4f`, `0d2a570` |
| 거점·트래픽 UI 이동 | frontend / dashboard | `3d4d00c` / `3ae49cf` |
| 다국어 | frontend / dashboard | `39be866` / `5ddfb46` |
| 패널 중앙 배치·드래그·이미지 기본 배치 | dashboard | `4a0a419`, `258178f`, `535ce2a` |
| JEV 진단 | builder / observer | `8d10f21`, `495ce4f` / `905e2ed` |
| Groq 진행 표시 계획 | frontend | `4e04529` |
| 팀원 변경과 main 통합 | frontend | `b86545c` |
