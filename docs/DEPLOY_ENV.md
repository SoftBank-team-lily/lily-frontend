# 로컬 → 배포 환경 변수 전환 안내

작성일: 2026-10-03. 팀 공유용. 현재 저장소의 코드·`.env.example`·배포 매니페스트를 기준으로 정리했습니다.

실제 운영 Secret이나 `.env.local`은 이 문서 작성 과정에서 변경하지 않았습니다. 아래 공개 도메인·DB·프런트/대시보드 Service 이름은 예시이며 인프라 담당자가 실제 값으로 대체해야 합니다. builder·observer의 Service 이름과 포트는 각 저장소의 매니페스트에서 확인했습니다. 운영 클러스터에 적용된 상태를 직접 조회한 결과는 아닙니다.

## 1. 팀에 전달할 요약

> 로컬의 `127.0.0.1:18070/18071/18072`는 SSH 터널·port-forward 주소입니다. 프런트를 클러스터에 올리면 builder·observer·DB provisioner의 내부 Service 주소로 변경합니다. 로그인은 공개 HTTPS 주소, 대시보드 API 연결은 내부 프런트 주소를 사용합니다. 대시보드는 같은 도메인의 `/dashboard`로 제공하며, Groq/JEV 키는 builder에만 주입합니다. 토큰·비밀번호·PEM은 Kubernetes Secret 등에서 주입합니다. 최신 SQL 적용 후 환경 변수를 넣고 다시 빌드·배포해야 합니다.

권장 접속 구조:

```text
브라우저 → https://lily.example.com
             ├─ /, /api/*        → frontend
             └─ /dashboard/*     → dashboard (basePath=/dashboard)

dashboard 서버 → frontend 내부 주소 → PostgreSQL / builder / observer / provisioner
observer·builder → frontend 내부 /api/internal/remediate
builder → JEV·Groq → 수정안 → frontend → GitHub 수정 PR
```

`lily.example.com`은 예시입니다. 실제 프런트 공개 도메인으로 교체하세요.

## 2. Frontend 설정

로컬 값은 README의 3210 실행 예시와 `.env.example` 기준입니다.

### 필수 인증·DB·배포 설정

| 변수 | 로컬 예시 | 배포 시 설정 | 비고 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql://…@localhost:5438/lily` | 운영 PostgreSQL 접속 문자열 | 인증·프로젝트·배포·AI 수정 이력 DB. 비밀번호는 Secret |
| `BETTER_AUTH_URL` | `http://localhost:3210` | `https://lily.example.com` | 사용자가 방문하는 공개 주소. 내부 Service URL을 넣지 않음 |
| `AUTH_TRUSTED_ORIGINS` | `http://localhost:3210` | `https://lily.example.com` | 필요한 공개 origin만 쉼표로 구분. 경로를 붙이지 않음 |
| `BETTER_AUTH_SECRET` | 개발용 무작위 값 | 운영용 32자 이상 무작위 값 | 모든 프런트 인스턴스에서 동일하게 유지 |
| `SMTP_URL` | `smtp://localhost:1026` | 운영 SMTP 접속 문자열 | 현재 코드는 이메일 인증이 필수이므로 SMTP를 비워 둘 수 없음 |
| `MAIL_FROM` | `Lily <noreply@lily.local>` | SMTP 제공자가 허용한 발신 주소 | 공개 도메인 인증·메일 서비스 설정과 일치 |
| `BUILDER_URL` | `http://127.0.0.1:18070` | `http://lily-builder.lily-system.svc.cluster.local` | 프런트가 클러스터 내부에서 실행되는 경우. Service 포트는 80 |
| `DEPLOYMENT_API_KEY` | 개발용 실행기 키 | 운영용 별도 32자 이상 무작위 값 | 내부 상태/사건 수신 인증. `BETTER_AUTH_SECRET`과 별도 |
| `NODE_ENV` | Next dev의 development | production | Next build/start 또는 컨테이너 실행 환경에서 설정 |

현재 인증 구현은 [auth/server.ts](../src/lib/auth/server.ts)의 `requireEmailVerification: true`와 [api.ts](../src/lib/api.ts)의 `emailVerified` 검사입니다. 이메일 인증을 없애는 것은 별도 코드 변경이며 환경 변수 변경만으로 적용되지 않습니다.

### 대시보드·모니터링

| 변수 | 로컬 예시 | 배포 시 설정 | 비고 |
| --- | --- | --- | --- |
| `DASHBOARD_ORIGIN` | `http://127.0.0.1:3000` | 대시보드 내부 원점, 예: `http://<dashboard-service>.<namespace>.svc.cluster.local:3000` | 원점만 지정. `/dashboard`를 붙이지 않음. **프런트 빌드·실행 환경 모두 설정** |
| `DASHBOARD_URL` | 빈 값 | 같은 도메인 프록시 방식이면 빈 값 유지 | 외부 목적지 이동용. 외부 도메인의 세션 공유 기능은 아님 |
| `OBSERVABILITY_URL` | `http://127.0.0.1:18071` | `http://lily-observer.lily-system.svc.cluster.local` | Service 포트 80. 실제 지표·파드·로그 조회 |
| `OBSERVABILITY_API_TOKEN` | observer에서 받은 토큰 | observer의 같은 이름 변수와 같은 운영 토큰 | Secret |
| `DEPLOYMENT_NAMESPACE` | `default` | 실제 **배포된 앱** namespace | builder 자체의 `lily-system`, 빌드 Job의 `lily-builds`와 구분 |
| `PROVISIONER_URL` | `http://127.0.0.1:18072` | `http://db-provisioner.lily-system.svc.cluster.local` | README·builder 매니페스트의 내부 주소 기준. 실제 Service 확인 |
| `PROVISIONER_API_TOKEN` | provisioner에서 받은 토큰 | provisioner와 같은 운영 토큰 | 프런트와 builder 양쪽에서 필요할 수 있음 |
| `INGRESS_API_URL` | 빈 값 또는 별도 연결 주소 | 실제 관리 API가 설치된 경우에만 내부 URL 설정 | Nginx/ALB의 앱 접속 URL을 넣는 변수가 아님 |
| `INGRESS_API_TOKEN` | 빈 값 | 해당 관리 API에서 요구하는 토큰 | API 미설치 시 URL·토큰을 함께 비워 둠 |

현재 README에는 `lily-ingress` 관리 API Service가 없다고 기록되어 있습니다. 실제 배포 때 인프라 담당자가 설치 여부를 확인해야 합니다. 이 설정이 비어 있으면 라우트 세부 정보가 연결 안 됨으로 나올 수 있습니다. 앱 배포나 observer 지표 연결과는 별개입니다.

### 배포 실행기 선택 설정

| 변수 | 배포 기본 예시 | 의미 |
| --- | --- | --- |
| `BUILDER_DATABASE` | `auto` | 사용자가 DB를 선택하지 않은 기존 프로젝트의 레포 분석 기본값 |
| `BUILDER_ALLOWED_OWNERS` | 빈 값 | 빈 값이면 GitHub 소유자 제한 없음. 제한할 때만 쉼표로 지정 |
| `BUILDER_POLL_MS` | `5000` | 서버 실행기가 builder 상태를 읽는 주기(ms) |
| `BUILDER_MAX_ACTIVE` | `2` | 서버 실행기의 동시 배포 한도 |

## 3. Dashboard 설정

저장소: `lily-monitoring-dashboard` (`/Users/hgsim/Downloads/lily-dashboard`).

| 변수 | 로컬 예시 | 배포 시 설정 |
| --- | --- | --- |
| `FRONTEND_URL` | `http://127.0.0.1:3210` | `http://<frontend-service>.<namespace>.svc.cluster.local:3000` 등 대시보드 서버에서 닿는 내부 프런트 원점 |
| `FRONTEND_AUTH_ORIGIN` | `http://localhost:3210` | 프런트의 `BETTER_AUTH_URL`과 같은 공개 origin: `https://lily.example.com` |
| `FRONTEND_PUBLIC_URL` | 같은 도메인 프록시 시 빈 값 | 같은 공개 도메인의 `/dashboard` 방식이면 빈 값 유지 |

`FRONTEND_URL`과 `FRONTEND_AUTH_ORIGIN`은 주소가 달라도 정상입니다. 앞의 값은 서버 간 연결 대상이고, 뒤의 값은 설정 변경 요청의 Origin 검사에 사용합니다.

대시보드에는 프런트 DB 비밀번호·SMTP·Groq·JEV·observer 토큰을 복사하지 않습니다. 대시보드가 사용자 쿠키를 내부 프런트 API로 전달하고 프런트가 소유권을 확인한 뒤 서비스를 조회합니다.

프런트의 `/dashboard/:path*` rewrite 또는 Nginx/Ingress에서 `/dashboard` 전체를 대시보드로 전달하세요. `basePath=/dashboard`를 유지하고 `/dashboard/_next/*`·정적 파일 경로도 전달해야 합니다. 서로 다른 공개 도메인에서 제공하려면 별도 인증 설계가 필요합니다.

## 4. AI 코드 수정·PR 진행 표시 설정

이 절은 **frontend의 `feature/ai-fix-progress` 작업 기준**입니다. main에 반영된 기능과 구분해서 공유하세요.

### Frontend

| 변수/조건 | 설정 |
| --- | --- |
| `REMEDIATE_ENABLED` | 기능을 운영에서 사용할 때 `true` |
| `BUILDER_URL` | 위의 builder 내부 Service 주소 |
| `DEPLOYMENT_API_KEY` | observer·builder의 `REMEDIATE_TOKEN`과 같은 값 |
| `GITHUB_APP_ID` | 실제 GitHub App ID |
| `GITHUB_APP_SLUG` | GitHub App 설치 주소의 slug |
| `GITHUB_APP_WEBHOOK_SECRET` | GitHub App 설정의 webhook secret과 같은 값 |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App PEM. 실제 줄바꿈, `\n` 이스케이프 또는 PEM base64 지원 |
| 프로젝트 설정 | 사용자별 GitHub App 설치 연결 + 해당 프로젝트의 **AI 수정 PR 허용** 활성화 |

GitHub App에서 등록할 외부 주소:

```text
Webhook URL: https://lily.example.com/api/github/webhook
Setup URL:   https://lily.example.com/api/github/install/complete
```

푸시 수신 외에 수정 PR도 만들려면 Repository **Metadata: Read**, **Contents: Read and write**, **Pull requests: Read and write** 권한이 필요합니다. 앱 권한을 변경한 뒤 기존 설치에도 승인·반영되어야 합니다.

### Builder

| 변수 | 배포 시 설정 |
| --- | --- |
| `REMEDIATE_ENABLED` | `true` |
| `GROQ_API_KEY` | 실제 Groq 키를 builder Secret에만 주입 |
| `GROQ_MODEL` | 현재 코드 기본값 `openai/gpt-oss-20b`. 생략하면 기본값 사용 |
| `JEV_API_KEY` | 코드 장애 여부 판정에 사용하는 JEV 키 |
| `REMEDIATE_FRONTEND_URL` | 프런트 내부 원점. `/api/internal/remediate` 경로를 붙이지 않음 |
| `REMEDIATE_TOKEN` | 프런트 `DEPLOYMENT_API_KEY`와 동일 |

`AiPatchModel`은 Groq 키가 있으면 Groq를 우선 사용합니다. 키가 없으면 Anthropic/OpenAI 설정을 사용하므로 화면에서는 제공자를 단정하지 않고 “AI 수정”으로 표시합니다. Groq 키를 프런트 `.env.local`이나 `NEXT_PUBLIC_*`에 넣지 않습니다.

### Observer

| 변수 | 배포 시 설정 |
| --- | --- |
| `REMEDIATE_ENABLED` | `true` |
| `REMEDIATE_FRONTEND_URL` | 프런트 내부 원점 |
| `REMEDIATE_TOKEN` | 프런트 `DEPLOYMENT_API_KEY`와 동일 |
| `CLOUDWATCH_LOGS_ENABLED` | 런타임 로그를 CloudWatch에서 수집할 때 `true` |
| `PROMETHEUS_URL` | 실제 Prometheus 내부 주소. 현재 기본 `http://prometheus.lily-system.svc:9090` |
| `LOG_GROUP`, `AWS_REGION` | Fluent Bit/CloudWatch의 실제 로그 그룹·리전 |

observer의 AWS 로그 접근 권한과 Kubernetes 조회 RBAC도 필요합니다. 환경 변수만 넣어도 접근 권한이 생기는 것은 아닙니다.

### 별도 JEV 관측 진단

이 기능은 로그 사고 수정 PR과 다른 진입점입니다. observer·builder **`feature/ai-diagnosis`** 구현 기준입니다.

| 서비스 | 변수 | 설정 |
| --- | --- | --- |
| observer | `DIAGNOSIS_ENABLED` | 사용할 때 `true` |
| observer | `DIAGNOSIS_BUILDER_URL` | `http://lily-builder.lily-system.svc.cluster.local` |
| observer·builder | `DIAGNOSIS_API_TOKEN` | 양쪽 동일한 별도 진단 전용 토큰 |
| observer·frontend | `OBSERVABILITY_API_TOKEN` | 양쪽 동일한 관측 API 토큰 |
| builder | `JEV_API_KEY` | JEV 후보 진단을 사용할 때 주입. 미설정·실패 시 규칙 기반 결과 |

진단 토큰과 수정 사건 토큰은 서로 다른 용도입니다. 키 일치 관계:

```text
frontend DEPLOYMENT_API_KEY = observer REMEDIATE_TOKEN = builder REMEDIATE_TOKEN
frontend OBSERVABILITY_API_TOKEN = observer OBSERVABILITY_API_TOKEN
frontend PROVISIONER_API_TOKEN = provisioner PROVISIONER_API_TOKEN
builder PROVISIONER_API_TOKEN = 같은 provisioner 토큰 (DB 생성·조회 사용 시)
observer DIAGNOSIS_API_TOKEN = builder DIAGNOSIS_API_TOKEN
```

## 5. 설정 예시

### Frontend — 클러스터 내부 실행 기준

아래 `${…}`는 실제 값으로 대체할 자리입니다. env 파일 자체가 자동으로 다른 Secret을 조회한다는 의미가 아닙니다. Service 이름과 포트도 실제 매니페스트에 맞추세요.

```dotenv
DATABASE_URL=${OPERATING_POSTGRES_CONNECTION}
BETTER_AUTH_URL=https://lily.example.com
AUTH_TRUSTED_ORIGINS=https://lily.example.com
BETTER_AUTH_SECRET=${AUTH_SECRET}
SMTP_URL=${OPERATING_SMTP_CONNECTION}
MAIL_FROM=Lily <noreply@YOUR_VERIFIED_DOMAIN>
DEPLOYMENT_API_KEY=${REMEDIATE_SHARED_TOKEN}
BUILDER_URL=http://lily-builder.lily-system.svc.cluster.local
BUILDER_DATABASE=auto
BUILDER_ALLOWED_OWNERS=
BUILDER_POLL_MS=5000
BUILDER_MAX_ACTIVE=2
DASHBOARD_ORIGIN=http://YOUR_DASHBOARD_SERVICE.YOUR_NAMESPACE.svc.cluster.local:3000
DASHBOARD_URL=
OBSERVABILITY_URL=http://lily-observer.lily-system.svc.cluster.local
OBSERVABILITY_API_TOKEN=${OBSERVER_TOKEN}
DEPLOYMENT_NAMESPACE=YOUR_APP_NAMESPACE
PROVISIONER_URL=http://db-provisioner.lily-system.svc.cluster.local
PROVISIONER_API_TOKEN=${PROVISIONER_TOKEN}
INGRESS_API_URL=
INGRESS_API_TOKEN=
REMEDIATE_ENABLED=true
GITHUB_APP_ID=${APP_ID}
GITHUB_APP_SLUG=${APP_SLUG}
GITHUB_APP_WEBHOOK_SECRET=${APP_WEBHOOK_SECRET}
GITHUB_APP_PRIVATE_KEY=${APP_PEM_OR_BASE64}
```

### Dashboard — 같은 공개 도메인 기준

```dotenv
FRONTEND_URL=http://YOUR_FRONTEND_SERVICE.YOUR_NAMESPACE.svc.cluster.local:3000
FRONTEND_AUTH_ORIGIN=https://lily.example.com
FRONTEND_PUBLIC_URL=
```

프런트를 클러스터 **밖의 VM**에서 실행하면 `.svc.cluster.local` 주소에 바로 연결할 수 있다고 가정하면 안 됩니다. 사설 네트워크·DNS·내부 프록시 등 VM에서 닿는 주소를 써야 합니다. 같은 VM에서 두 Node 프로세스를 실행하는 경우 `DASHBOARD_ORIGIN=http://127.0.0.1:3001`, `FRONTEND_URL=http://127.0.0.1:3000`은 운영에서도 가능합니다. 컨테이너가 다르면 `127.0.0.1`은 각 컨테이너 자신을 가리킵니다.

## 6. 적용 순서

1. 공개 프런트 도메인, frontend/dashboard 내부 Service와 포트, 앱 namespace를 확정합니다.
2. frontend·builder·observer·provisioner 각각의 ConfigMap/Secret에 해당 설정을 주입합니다. 위의 공유 토큰 일치 관계를 맞춥니다.
3. 프런트 DB 마이그레이션을 한 번 실행합니다. 이 브랜치에는 기존 main SQL 다음에 `014` GitHub webhook, `015` GitHub 설치, `016` 수정 PR, `017` 수정 진행 테이블이 추가됩니다.
4. `DASHBOARD_ORIGIN`을 주입한 환경에서 프런트를 다시 빌드하고, 대시보드도 `/dashboard` basePath로 빌드합니다.
5. 실행 환경에도 변수를 주입하고 프로세스/Pod를 재시작합니다. `.env.local`을 바꾸거나 Kubernetes Secret만 갱신해도 실행 중인 프로세스에 자동 반영되지 않습니다.
6. Nginx/Ingress의 HTTPS, 공개 도메인, `/dashboard` 전체 전달을 연결합니다.
7. GitHub App URL·권한·설치 연결을 맞추고 프로젝트의 AI 수정 허용을 켭니다.

기존 develop의 GitHub SQL(`007`~`009`)이 이미 적용된 DB라면 `014`~`016`을 그대로 재실행하면 같은 테이블/컬럼 생성 충돌이 날 수 있습니다. main 기준 DB인지 먼저 확인하고 이미 적용한 SQL의 내용과 `lily_migrations` 기록을 대조해 DB 담당자가 이력을 정리하세요. 이 문서 작성 과정에서 운영 DB 마이그레이션은 실행하지 않았습니다.

## 7. 연결 확인 항목

| 확인 항목 | 정상 기준 |
| --- | --- |
| 로그인·가입·메일 | 공개 HTTPS URL로 링크 생성, 인증 메일 수신, 로그인 쿠키 유지 |
| 앱 배포 | 레포 등록 → builder 작업 → 실제 배포 URL 표시 |
| 대시보드 | 같은 공개 도메인의 `/dashboard?project=<UUID>` 진입, 프로젝트 소유권 확인 |
| 모니터링 | 앱 namespace와 이름이 맞고 observer 지표·파드·로그 표시 |
| DB 정보 | provisioner 조회 정상, 토큰 불일치 401/403 없음 |
| 대시보드 설정 변경 | `FRONTEND_AUTH_ORIGIN`과 공개 origin 일치, Origin 검사 403 없음 |
| AI 수정 | 사건 수신 → 하단 단계 표시 → 변경 파일 → PR 검토 대기 |
| 재접속 | 페이지 새로고침 후 DB에 기록된 수정 이력 복원 |

현재 Groq 코드 수정 진입점은 **배포 후 런타임 장애**입니다. 빌드/컴파일 실패의 Groq 코드 수정은 별도 연동이 필요합니다. 설정 자동 수정·재배포와 혼동하지 마세요. PR 검토 대기는 실제 코드 적용·컴파일·테스트 성공을 의미하지 않습니다.

## 8. 확인한 소스

- frontend: [환경 변수 예시](../.env.example), [인증](../src/lib/auth/server.ts), [Origin 검사](../src/lib/api.ts), [대시보드 프록시](../next.config.ts), [배포 실행기](../src/lib/builder/worker.ts), [모니터링](../src/lib/monitor/server.ts), [GitHub 설정](../src/lib/github/app.ts), [수정 사건 수신](../src/lib/remediate/accept.ts).
- dashboard: `lib/frontend.ts`, `.env.example`, `next.config.ts`.
- builder: `src/main/resources/application.yml`, `AiPatchModel.java`, `deploy/k3s/lily-builder.yaml`.
- observer: `src/main/resources/application.yml`, `deploy/k3s/lily-observer.yaml`.

builder의 레지스트리/IAM·Cloudflare·온프레미스 터널·DynamoDB 등 전체 인프라 설정은 해당 저장소의 기존 매니페스트를 유지합니다. 여기서는 프런트·대시보드 연결과 AI 기능을 배포로 전환할 때 맞춰야 하는 설정을 정리했습니다.
