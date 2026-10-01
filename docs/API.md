# 계정·프로젝트 API

API는 Next.js Node.js 서버에서 실행하며 계정·세션·프로젝트를 PostgreSQL에 저장합니다.
개발 주소는 실행 포트에 따라 달라집니다. 현재 작업 환경은 `http://localhost:3210`입니다.

이 문서는 현재 구현 계약입니다. 팀 피드백의 확장 필드·SMTP 없는 인증 정책은
[DEPLOY.md의 T19~T29](./DEPLOY.md)에 계획했으며 아래 API에는 아직 적용하지 않았습니다.

## 1. 계정과 세션

인증 경로는 `/api/auth`이며 Better Auth 서버 핸들러를 사용합니다.

| 메서드·경로                     | 입력                                                    | 결과                                   |
| ------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `POST /sign-up/email`           | `email`, `password`, `name`, 선택 `callbackURL`         | 계정 생성·인증 메일, 인증 전 세션 없음 |
| `POST /sign-in/email`           | `email`, `password`                                     | 이메일 인증 확인 후 세션 쿠키          |
| `POST /sign-out`                | —                                                       | 현재 DB 세션·쿠키 무효화               |
| `GET /get-session`              | 세션 쿠키                                               | 현재 세션 또는 `null`                  |
| `POST /update-user`             | `name`                                                  | 본인 표시 이름 수정                    |
| `POST /change-password`         | `currentPassword`, `newPassword`, `revokeOtherSessions` | 본인 비밀번호 변경                     |
| `POST /send-verification-email` | `email`, `callbackURL`                                  | 인증 메일 재발송                       |
| `GET /verify-email`             | 메일의 `token`, `callbackURL`                           | 이메일 인증·복귀                       |
| `POST /request-password-reset`  | `email`, `redirectTo`                                   | 재설정 메일                            |
| `POST /reset-password`          | `token`, `newPassword`                                  | 비밀번호 재설정·기존 세션 무효화       |

위 경로 앞에 `/api/auth`를 붙입니다. 입력이 있는 요청은 JSON입니다.
표시 이름은 1~50자, 비밀번호는 12~128자입니다. 회원가입 UI에서 이름을 생략하면
이메일의 앞부분으로 기본 이름을 만듭니다. 이메일 미인증 계정은 로그인할 수 없습니다.

메일 링크는 1시간 동안 유효합니다. 개발 환경에서는 `http://localhost:8026`의
Mailpit에서 메일을 확인하고 링크를 엽니다. 운영에서는 SMTP 발송 설정이 필요합니다.
재설정·재발송 응답으로 계정 존재 여부를 알려주지 않습니다.

세션은 HttpOnly·SameSite=Lax 쿠키, 운영 환경에서는 Secure 쿠키입니다.
DB에서 세션을 검증하며 쿠키 캐시를 사용하지 않습니다. 세션은 7일, 갱신 간격은 1일입니다.
클라이언트는 세션을 localStorage에 저장하지 않습니다.

인증의 기본 요청 제한 외에 이메일별 로그인 10회/분, 가입 5회/분,
재설정·인증 메일 각각 3회/분 제한을 적용합니다. 제한 정보는 DB에 원자적으로 기록합니다.
운영 프록시는 실제 클라이언트 IP를 전달하고 임의의 전달 헤더를 차단하도록 구성해야 합니다.

## 2. 프로젝트 API 공통

- 모든 요청은 인증된 세션 쿠키가 필요하며 이메일 인증을 확인합니다.
- POST·PATCH 요청은 `Content-Type: application/json`과 허용된 `Origin`이 필요합니다.
  브라우저의 같은 출처 요청은 Origin을 자동으로 전달합니다.
- 서버가 세션에서 소유자를 결정합니다. 요청 본문에 `ownerId`를 넣지 않습니다.
- 프로젝트 ID·배포 ID는 UUID입니다. 레포 slug로 접근 권한을 판단하지 않습니다.
- 응답은 `Cache-Control: no-store`입니다. JSON 본문은 최대 16KiB입니다.
- 프로젝트 등록·이름 수정은 사용자당 20회/분, 배포 기록 생성은 10회/분으로 제한합니다.

공통 오류 형식:

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "로그인이 필요해요." } }
```

| 상태      | 의미                                              |
| --------- | ------------------------------------------------- |
| 400       | 입력·UUID·중복 방지 키 오류                       |
| 401       | 로그인 필요                                       |
| 403       | 이메일 미인증 또는 허용되지 않은 Origin           |
| 404       | 프로젝트 없음 또는 다른 사용자 프로젝트           |
| 409       | 중복 프로젝트, 미완료 배포, 상태 전환·이벤트 충돌 |
| 413 / 415 | 본문 크기·JSON 형식 오류                          |
| 429       | 요청 제한                                         |
| 503       | 실행기 키·대시보드 설정 오류                      |

인증 라이브러리 경로의 오류는 `{ code, message }` 형식이며 프로젝트 API와 구분합니다.

## 3. 프로젝트 등록·조회·수정

`POST /api/projects`

```json
{ "repo": "SoftBank-team-lily/lily-frontend", "name": "Lily 프런트엔드" }
```

레포 주소를 정규화해 소문자로 저장합니다. 이름은 선택이며 생략하면 레포 이름을 사용합니다.
같은 사용자에게 같은 레포가 이미 등록되어 있으면 409를 반환합니다.
등록 자체는 배포를 실행하거나 GitHub 저장소 권한을 부여하지 않습니다.

프로젝트 응답:

```ts
type Project = {
  id: string;
  repo: string;
  name: string;
  createdAt: string; // ISO 날짜
  latestDeployment: { id: string; status: DeploymentStatus } | null;
};
```

- `GET /api/projects?limit=20&cursor=<프로젝트ID>` → `{ items, nextCursor }`.
  본인 프로젝트만 최신순으로 반환합니다. limit은 1~100, cursor는 선택입니다.
- `GET /api/projects/:id` → 본인 프로젝트.
- `PATCH /api/projects/:id`, 본문 `{ "name": "새 이름" }` → 수정된 프로젝트.
  이름은 1~100자입니다.

## 4. 배포 기록과 실행기 연결

`POST /api/projects/:id/deployments`

- 본문은 `{}`입니다.
- `Idempotency-Key` 헤더에 요청별 고유 키(1~128자)를 전달합니다.
- 같은 프로젝트·키를 재사용하면 같은 기록을 반환합니다.
- 생성 상태는 항상 `queued`입니다. 사용자 요청으로 성공 상태를 만들지 않습니다.
- **배포 실행 엔진은 아직 연결하지 않았습니다.** 이 요청은 DB의 대기 기록만 생성합니다.

`GET /api/projects/:id/deployments` → `{ items }`, 최신 기록 최대 100개.

```ts
type DeploymentStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rolled-back";
type Deployment = {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  createdAt: string;
  finishedAt: string | null;
};
```

실행기는 `POST /api/internal/deployments/:id/events`를 호출합니다.
`Authorization: Bearer <DEPLOYMENT_API_KEY>`와 JSON을 전달합니다.
이 키는 서버에만 보관하며 브라우저에 전달하지 않습니다.

```json
{ "eventId": "실행기-고유-이벤트ID", "status": "running" }
```

허용 전환:

- `queued → running / failed`
- `running → succeeded / failed`
- `succeeded / failed → rolled-back`

동일 이벤트 ID·상태 재전송은 중복 처리하지 않습니다. 같은 ID의 다른 상태는 409입니다.
DB 트랜잭션과 행 잠금으로 동시 상태 변경을 처리합니다.

## 5. 꽃과 대시보드 진입

`GET /api/projects/:id/entry` → `{ project, destination }`.

소유권과 최신 배포의 `succeeded` 상태를 확인합니다. 성공 전이면 409입니다.
`DASHBOARD_URL` 미설정 시 `destination`은 `null`입니다.
설정된 URL에는 `project=<프로젝트ID>`를 붙이며 세션 비밀값은 전달하지 않습니다.
외부 대시보드는 별도로 로그인·소유권을 검증해야 합니다. 외부 앱 SSO는 이번에 구현하지 않았습니다.

계정 화면에서 성공한 프로젝트를 선택하면 `/?project=<ID>`의 꽃 화면으로 이동합니다.
꽃 클릭 전과 확대 완료 시 API에서 권한을 확인합니다.
현재 공개 랜딩의 시연 결과는 실제 프로젝트나 배포 기록으로 저장하지 않습니다.

## 프로젝트 관측 (2026-10-02)

`GET /api/projects/:id/monitor?window=15m&level=all`

로그인 및 이메일 인증, 프로젝트 소유권을 확인한다. `window`: `5m|15m|1h|6h`, `level`: `all|error`.
앱 이름은 최신 `builder_runs.app_name`에서 찾는다. 요청에 앱 이름·namespace·서비스 URL을 받지 않는다.
응답: `project`, `appName`, `namespace`, `window`, `generatedAt` 및 아래 리소스.

| 필드 | 연결 서비스 |
| --- | --- |
| status | observer `/api/apps/{app}/status` |
| metrics | observer `/api/apps/{app}/metrics` (앱 전체, errorRate 0~1, 지연 ms) |
| pods | observer `/api/apps/{app}/pods` (CPU millicores, 메모리 MiB, 미수집 null) |
| logs | observer `/api/apps/{app}/logs`, 최대 100줄, 저장된 비밀값 마스킹 |
| app | observer `/api/apps`에서 해당 앱만 선택 |
| route | ingress `/api/v1/routes/{namespace}/{app}` |
| databases | provisioner `/api/databases?projectId={appName}`, id/engine/status만 반환 |

각 리소스는 `{state:"ready",data:...}` 또는 `{state,message}`이다.
상태: `unconfigured`(미설정), `unavailable`(연결·응답 실패), `pending`(배포·리소스 대기),
`unsupported`(온프레미스 관측 미지원). 일부 실패에도 나머지 데이터는 반환한다.
401/403/404는 인증·소유권 오류이며, 목업 데이터로 대체하지 않는다.
조회는 캐시하지 않는다. 서비스 토큰은 서버 환경변수에만 둔다.

`DASHBOARD_ORIGIN` 설정 시 프로젝트 entry의 destination은 `/dashboard?project={UUID}`이다.
꽃 진입은 성공한 배포에만 허용한다. 계정의 대시보드 링크는 실패/진행 중인 프로젝트도 조회할 수 있다.
