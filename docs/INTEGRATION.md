# 팀 구현 현황과 연동 작업

확인일: 2026-10-01. GitHub 조직 `SoftBank-team-lily`의 실제 소스와 브랜치를 읽어 정리했습니다.
**구현됨**은 확인한 커밋에 코드가 있다는 뜻입니다. 이번 작업에서 운영 배포·통합 테스트를 실행하지 않았습니다.
관측 모듈의 클러스터 적용 여부는 해당 README의 팀 운영 기록이며 이번에 직접 검증한 결과는 아닙니다.

## 1. 확인한 저장소와 기준

| 저장소·브랜치 | 확인 커밋 | 코드에서 확인한 기능 | 연결이 남은 부분 |
| --- | --- | --- | --- |
| [lily-frontend main](https://github.com/SoftBank-team-lily/lily-frontend/tree/1c1d917d517fb3d2bbab72e5eca2cd5713d003ca) | `1c1d917` | 실제 배포 실행기·폴링, 설정 입력/수정, 재배포, 클라우드/온프레미스 선택, 에이전트 연결, DB 감지/선택, 실패 이유·로그·꽃 진입 | 운영 설정, 대시보드/관측 연결, 인증 정책 변경 |
| [lily-frontend develop](https://github.com/SoftBank-team-lily/lily-frontend/tree/1953ad60f401b628b9619f95b1e1b62ad832b9a2) | `1953ad6` | GitHub push 웹훅 서명 검증·브랜치 필터·재배포 기록 생성 | main 병합, 최신 배포/DB 선택 기능과 통합, 정확한 소스 커밋 전달 |
| [lily-builder main](https://github.com/SoftBank-team-lily/lily-builder/tree/133fb6c489bf736270aeb9b2378dd6de6c1760c4) | `133fb6c` | GitHub 소스·Dockerfile 자동 생성·Kaniko·CI/CD 요청·DB 감지·상태/로그/URL 조회, 에이전트 제어, 플랫폼 Cloudflare/DB 터널 연결 | 프런트 미지원 필드 전달, 관측 대상 매핑 노출, 운영 환경 확인 |
| [lily-cicd main](https://github.com/SoftBank-team-lily/lily-cicd/tree/42fe8d0ac031d4629a0229cc9e8418c228e9bcec) | `42fe8d0` | 블루그린/카나리 배포·HTTP/TCP 헬스체크·DB 준비·SQL 마이그레이션·롤백·진행 조회 | 새 ingress 모듈 호출, 대시보드에 실제 활성 릴리스/롤백 결과 전달 |
| [lily-on-premise main](https://github.com/SoftBank-team-lily/lily-on-premise/tree/527569f8664afda4203c9e636420a739b5cd7ee0) | `527569f` | Docker 로컬 배포·헬스체크·전환/롤백·builder WebSocket 잡 수신·토큰 기반 플랫폼 연결·공개 주소/DB 터널 처리 | 사용자 환경에서 한 줄 명령 검증, 대시보드 관측 가용성 계약 |
| [lily-db-provisioner main](https://github.com/SoftBank-team-lily/lily-db-provisioner/tree/54aa7eecf800399ff142d2c608625ebe3179d01a) | `54aa7ee` | PostgreSQL/MySQL 앱별 DB 생성·조회·접속 환경변수·엔진 목록·삭제 | 대시보드에 비밀값을 제외한 DB 상태 표시, 프로젝트 삭제 시 정리 연결 |
| [lily-observer main](https://github.com/SoftBank-team-lily/lily-observer/tree/d2cdd8763e61802e1b4196b587a4060932e20204) | `d2cdd87` | Prometheus 요청 지표·CloudWatch 로그·앱/파드/노드 조회·위험도 상태·Swagger/OpenAPI | 대시보드 API 변환, 사용자 범위 보호. 자동 감시 루프·배포 이벤트 수신·자동 롤백은 보류 |
| [lily-ingress-nginx main](https://github.com/SoftBank-team-lily/lily-ingress-nginx/tree/0037ba9fdc08fb100b75cd2d7ced023c5e190636) | `0037ba9` | 라우트 등록/조회·추가 호스트·카나리 가중치·주소 조회·백엔드 파드/노드 조회 | CI/CD의 HttpTrafficRouter 연결·Ingress 작성 주체 전환 |
| [lily-loadbalancer main](https://github.com/SoftBank-team-lily/lily-loadbalancer/tree/a14173d49a3fc7ead13787e2310cee5cc41c9f47) | `a14173d` | ALB/TLS → ingress-nginx → Service 경로의 설정/매니페스트, builder 외부 소켓 경로 | 프런트/대시보드 경로·인증 전달, 새 ingress 모듈로 관리 주체 정리 |
| [lily-jev main](https://github.com/SoftBank-team-lily/lily-jev/tree/dba067aa7ceb4bffbf89749841895b5396dd5002) | `dba067a` | 선택/예·아니오 질문 클라이언트, 제한 시간·확신도·실패 시 빈 답 처리 | builder/observer의 실제 소비자 연결. 해당 main 소스/의존성에서 Jev 연결을 확인하지 못함 |

조직의 `lily-monitoring-dashboard`는 조회 시 원격 브랜치 목록이 비어 있었습니다.
대시보드 차이 분석은 `/Users/hgsim/Downloads/lily-dashboard`의 로컬 코드 기준입니다.
로컬에 있던 미추적 `docs/real-deployment-tasks.md`는 읽기만 했으며 변경하지 않았습니다.

### 이번에 추가된 프런트 변경

직전 병합 커밋 `f49cba9` 이후 main에 들어온 변경입니다.

- PR #3: 랜딩에서 클라우드/온프레미스 배포 위치 선택, 온프레미스 에이전트 연결 안내.
- PR #4: 공개 에이전트 이미지의 `docker run` 한 줄 실행·복사. 사용자 PC에 플랫폼 Cloudflare API 토큰·SSH CA 개인키를 직접 입력하지 않는 흐름.
- PR #5: DB 확인 창 선택 목록의 글자색 수정.
- 앞서 병합된 실제 배포 실행기·DB 감지/선택·배포 설정·진행 로그·실패 이유·재배포도 유지됩니다.
- GitHub 웹훅은 develop에만 있습니다. 저장소 기본 브랜치는 develop이지만 현재 작업/푸시 브랜치는 main입니다. 이번 검토에서 브랜치를 합치지 않았습니다.
- 조사 시 위 주요 저장소의 열린 PR은 없었습니다. 열린 PR이 없다는 것만으로 저장소 간 연결 완료를 판단하지 않았습니다.

## 2. 이미 구현되어 재사용할 기능

### 배포와 설정

프런트 프로젝트 생성/수정 → DB → Next.js 실행기 → builder → CI/CD 또는 에이전트 흐름이 있습니다.
`BUILDER_URL`이 설정될 때만 실행기가 시작하며, 배포 기록이 없는 프로젝트의 첫 배포도 생성합니다.
클라이언트는 프로젝트 상태를 읽어 실제 결과·진행 로그를 표시합니다.

현재 프런트 입력/전달 범위는 `repo`, `name`, `target`, `branch`, `rootDir`, `port`, `healthPath`, `env`, `database`입니다.
실행기는 `port → targetPort`, `healthPath → readinessPath/livenessPath`, DB 없음 → 빈 database로 변환합니다.
같은 사용자·레포도 `rootDir`이 다르면 프로젝트를 분리할 수 있습니다.

builder에는 다음 기능도 있으므로 재구현할 필요가 없습니다.

- Dockerfile 우선 사용, 없으면 감지한 스택으로 생성.
- 루트에 앱이 없을 때 최상위 앱 폴더 탐색. 서버 앱 하나+정적 프런트 하나이면 Caddy를 포함한 한 이미지로 묶는 제한적인 자동 조합.
- 이 자동 조합은 모든 모노레포/Next.js SSR 조합 지원이 아닙니다. 공통 workspace 경로와 여러 서버 앱은 별도 계약이 필요합니다.
- 비공개 GitHub 토큰, 마이그레이션 경로/사용 여부, 카나리 판정 경로를 받는 요청 필드.
- 에이전트 토큰·연결 상태·잡 전달, 공개 주소와 DB 터널의 플랫폼 중계.

### 실제 API의 책임

| 호출자 → 대상 | 현재 API | 연동 시 사용할 정보 |
| --- | --- | --- |
| 프런트 서버 → builder | `POST /api/builds`, `GET /api/builds/{id}` | 외부 build ID, 상태, 로그, 이미지, URL |
| 프런트 서버 → builder | `POST /api/detect` | DB 종류·감지 근거·감지 폴더. 현재 프런트는 DB 종류만 사용 |
| 프런트 서버 → builder | `/api/agents`, `/api/agents/{key}`, `/api/agents/{key}/builds` | 계정 에이전트·연결·온프레미스 배포 |
| 프런트/대시보드 서버 → observer | `/api/apps/{app}/status`, `/metrics`, `/logs`, `/pods` | 앱 운영 상태·요청 지표·실행 로그·파드 |
| 프런트/대시보드 서버 → observer | `/api/apps`, `/api/nodes` | 앱/노드 목록. 서비스 토큰만으로 사용자 소유권이 나뉘지는 않음 |
| builder 또는 소유권 검증 서버 → CI/CD | `/api/deployments/{app}`, `/progress`, `POST /rollback` | 활성 릴리스·롤백 가능 여부·진행·롤백 결과 |
| 소유권 검증 서버 → builder | `POST /api/apps/{app}/rollback`, `/home` | 클라우드/온프레미스 롤백 분기·온프레미스 거점 전환 |
| CI/CD → DB provisioner | `/api/databases?projectId={appName}`, `/api/databases/{id}/env` | 앱 DB 재사용·접속 정보 주입. 여기의 projectId는 프런트 UUID가 아닌 appName |
| CI/CD → 새 ingress 서비스 | `PUT /api/v1/routes/{namespace}/{app}` 등 | 라우트/카나리 등록. 호출자 연결은 아직 필요 |

builder의 외부 호스트 `builder.apps.lilycloud.kr`는 매니페스트에서 `/api/burst`와 `/api/agents/connect`만 노출합니다.
따라서 이 호스트를 그대로 `BUILDER_URL`로 넣어 `/api/builds`를 호출하는 구성을 전제로 하면 안 됩니다.
서버는 접근 가능한 내부 builder 주소를 사용하고, 에이전트만 공개 WebSocket 주소를 사용합니다.

## 3. 대시보드와 observer 계약 차이

대시보드의 `docs/api-contract.md`는 초안이며 현재 observer 계약과 일치하지 않습니다.
`NEXT_PUBLIC_API_BASE_URL`만 바꾸면 연결된다는 기존 설명은 실제 observer에 그대로 적용되지 않습니다.

| 항목 | 대시보드 현재 기대 | observer 실제 구현 | 필요한 변경 |
| --- | --- | --- | --- |
| 호출 위치 | 브라우저에서 API 주소 호출 | ClusterIP 서비스, CORS 없음, 설정 시 서비스 Bearer 토큰 필요 | 세션/소유권을 확인하는 서버 호출 계층. 토큰을 NEXT_PUBLIC 변수에 넣지 않음 |
| 프로젝트 선택 | 고정 NEXT_PUBLIC_APPS, 첫 앱 선택 | 관측 API는 appName·namespace로 조회 | project UUID로 진입, 서버에서 실제 앱 매핑 후 조회 |
| 지표 요청 | `range=15m/1h` | `window`, 기본 10m·최대 6h, namespace | 쿼리 변환과 시간 범위 검증 |
| 지표 응답 | versions, byVersion, panels, traffic, thresholds | app, namespace, current, series 배열 | 앱 전체 지표 타입·그래프 변환, 상태 API 별도 사용 |
| 요청 수 | 구간별 요청 건수, 최근 5분 요약 | current는 최근 1분의 분당 요청 수, series는 30초마다 최근 1분 값 | 단위/레이블을 분당 요청 수로 변경. 겹치는 1분 값을 합쳐 총건수로 표시하지 않음 |
| 판정 | ok/warn/bad/unknown·패널별 상태 | `/status`의 HOLD/NORMAL/NOTICE/WARNING/CRITICAL, gray/green/yellow/red, message·reason | 백엔드 판정·문구 사용. NOTICE와 NORMAL을 구분해 보존 |
| 버전 비교 | 버전별 에러율·p95·트래픽 비율 | 입구 지표는 앱 전체. 앱/파드/로그에는 슬롯·이미지 정보 있음 | 슬롯/이미지 목록은 표시 가능. 버전별 수치·가중치는 추가 API 전까지 미지원으로 표시 |
| 로그 요청 | level=WARN/ERROR, 최신순 | level=all/error, since·limit, 반환은 오래된 순 | 필터 선택지·정렬 수정. WARN 이상이나 정확한 ERROR 수준 필터로 오인하지 않음 |
| 로그 응답 | items·cursor, timestamp·level·version·traceId | 배열, at·pod·slot·image·message | 실제 필드로 변환. 없는 level/traceId/exception/cursor를 만들어 채우지 않음 |
| 서버 지표 | `/api/servers?range=...`, memory bytes, 상태/문구 | `/api/nodes`, 배열, MiB 단위·nullable 사용량·ready | 경로/단위/타입 수정. null 사용량은 0이 아닌 수집 없음 |
| 파드 상태 | 별도 패널 없음 | ready·restarts·problem·lastRestartReason·CPU·memory API 있음 | CrashLoopBackOff/OOMKilled 등 실제 장애 정보를 패널에 연결 |
| 미설정 | BASE가 없으면 자동 mock | 실제 연결 실패/관측 대기 상태 | project URL에서는 자동 데모 전환 금지, 데모 진입을 별도로 명시 |

observer의 `/status`는 앱 전체 상태입니다. 요청 수·에러율·p95 패널별 판정인 것처럼 같은 결과를 복제하지 않습니다.
버전별 응답 시간·에러율을 얻기 위해 앱 전체 수치를 각 슬롯에 복제하지 않습니다.
내 PC 에이전트가 연결돼도 클라우드 observer가 해당 PC의 컨테이너·요청을 수집한다는 뜻은 아닙니다.

## 4. 코드 검토에서 발견한 연동 제약

1. **프로젝트 관측 대상 누락:** builder_runs에 app_name은 저장하지만 프로젝트 API에는 appName·namespace가 없습니다. database도 저장만 하고 프로젝트 응답에는 없습니다. 활성 서비스와 최신 배포 시도를 구분하는 매핑이 필요합니다.
2. **롤백 상태 손실:** 프런트 worker의 finalStatus는 builder ROLLED_BACK을 failed로 저장합니다. 모델/UI는 rolled-back을 지원하지만 실제 worker 경로에서 구분되지 않습니다. 카나리 거부·직접 롤백·부분 스키마 롤백의 계약을 맞춰야 합니다.
3. **새 라우터 연결 미완료:** CI/CD의 ModuleConfiguration 기본 라우터는 여전히 직접 Kubernetes를 쓰는 NginxIngressRouter입니다. 새 ingress 서비스 README도 HttpTrafficRouter 연결을 남은 작업으로 명시합니다. 양쪽이 동시에 같은 Ingress를 관리하지 않도록 전환 순서가 필요합니다.
4. **프런트 미지원 builder 필드:** GitHub token, migrationsPath, migrate, canaryPath는 builder에 있으나 프런트 입력/저장/전달에는 없습니다. HTTP와 TCP 헬스체크도 UI 계약을 맞춰야 합니다. 현재 healthPath 검증은 `/...`만 받고 `tcp`는 받지 않습니다.
5. **브랜치 기본값 차이:** 입력 안내는 기본 브랜치지만 builder는 생략 시 main을 사용합니다. 기본 브랜치 자동 조회 또는 안내/요청 명시가 필요합니다.
6. **DB 감지 실패 의미:** 프런트 detectDatabase는 builder 미설정·연결 실패·감지 실패를 모두 none으로 반환합니다. DB 없음과 감지 불가를 구분하고 builder의 databaseSource·dir을 전달해야 합니다.
7. **비밀값 처리:** env 값은 일반 프로젝트 조회에서 제외되고 키만 반환됩니다. 저장은 jsonb이며 암호화 구현은 확인되지 않았습니다. observer 로그 변환에서도 토큰/비밀번호 마스킹을 확인하지 못했습니다. 비밀값/로그의 서버 처리와 반환 계약을 연결해야 합니다.
8. **웹훅의 소스 SHA:** develop 웹훅은 push SHA를 배포 request_key에 쓰지만 worker는 그 SHA를 builder 요청에 전달하지 않습니다. 빠른 연속 push에서는 웹훅 커밋과 실제 빌드 커밋이 다를 수 있습니다. delivery/커밋과 빌드 소스 고정을 연결해야 합니다.
9. **삭제 흐름 누락:** 배포 위치 충돌 안내는 삭제 후 재등록을 말하지만 프런트 프로젝트 DELETE API는 없습니다. DB/라우트/앱/에이전트의 삭제 책임과 사용자 동작을 함께 정해야 합니다.
10. **미완료 인증/자동 판단:** 별도 아이디·SMTP 없는 가입은 여전히 계획입니다. requireEmailVerification와 프로젝트의 emailVerified 검사는 남아 있습니다. observer 자동 감시·자동 롤백, Jev 소비자 연결도 완료 기능으로 표시하지 않습니다.

## 5. 실제로 연결할 작업 순서

아래 I 번호는 이번 연동 검토의 작업 번호입니다. 기존 T19~T29와 로컬 대시보드 Task 0~8을 대체해 자동으로 완료 처리하지 않습니다.

| 작업 | 담당 | 선행 | 구현 내용·완료 기준 |
| --- | --- | --- | --- |
| I1 환경·브랜치·계약 정리 | 프런트/인프라 | 없음 | main/develop 통합 범위 결정, 신규 SQL 적용, 내부 BUILDER_URL 설정, API.md를 현재 타입에 맞춤. 새 컬럼 오류 없이 프로젝트 API 사용 가능 |
| I2 인증·프로젝트 관측 대상 | 프런트 서버/대시보드 | I1 | 대시보드 세션 전달 방식, project UUID → 소유권 → appName/namespace/target/활성 릴리스 매핑. 다른 사용자 데이터 요청 차단 |
| I3 프로젝트 진입·실데이터 상태 | 대시보드 | I2 | ?project 진입·사용자 프로젝트 목록·URL 전환·사용자별 쿼리 캐시. 실제 진입에서 mock이 나오지 않고 대기/오류 구분 |
| I4 관측 API 어댑터 | 서버/observer/대시보드 | I2·I3 | status/metrics/logs/pods/nodes 서버 호출·단위/필터/nullable 변환. 실제 앱의 상태·그래프·로그·파드가 표시됨 |
| I5 배포/DB/에이전트 정보 | 프런트 서버/대시보드 | I2 | 배포 시도·활성 앱 분리, 빌드 로그·앱 로그 분리, DB 종류/상태와 에이전트 연결·수집 가용성 표시. 지표가 없어도 배포 정보는 조회 가능 |
| I6 롤백·재배포 결과 연결 | 프런트 서버/CI/CD/대시보드 | I2·I5 | 소유권을 확인하는 조작 API, ROLLED_BACK/PARTIAL 구분, 카나리 실패 뒤 기존 앱 유지 표시. 자동 롤백은 별도 보류 |
| I7 Nginx 라우터 전환 | CI/CD/인프라 | I1, 모듈 간 합의 | HttpTrafficRouter → 카나리/조회 전환 → 작성 권한/중복 매니페스트 정리. 실제 URL·트래픽 가중치를 authoritative 응답으로 제공 |
| I8 설정·웹훅·인증 보완 | 프런트/빌더 | I1 | private token·마이그레이션·canary 경로, DB 감지 실패 구분, 웹훅 커밋 고정, 사용자 아이디 정책. 각각 실제 요청에 전달되고 상태로 확인 가능 |
| I9 전체 연결 검증 | 각 담당 | 연결 완료 범위 | 공개/비공개 레포, Dockerfile 유무, 다른 rootDir, cloud/onprem, 실패/롤백, 직접 대시보드 접근·타인 UUID·수집 장애를 실제 환경에서 확인 |

권장 진행: **I1 → I2 → I3 → I4/I5 병행**. I7은 CI/CD·인프라가 병행하고 I6·I8은 계약이 준비된 항목부터 연결합니다.
Jev는 기본 관측 연결 이후 builder/observer에서 별도 연결합니다. 대시보드에서 직접 AI API를 부르는 구성은 현재 팀 설계에 없습니다.

## 6. 현재 로컬 실행 환경

이번에 값을 노출하지 않고 환경 설정 유무와 마이그레이션 이력만 읽었습니다.

- 프런트 작업 브랜치: main, 확인 시 origin/main과 동일.
- 적용된 앱 SQL: `001-projects.sql`만 존재. main의 `002`~`007-project-database.sql`은 미적용.
- BUILDER_URL·DASHBOARD_URL: 미설정. worker는 켜지지 않고 외부 대시보드 목적지도 없습니다.
- 관측 연결 서버 변수/토큰: 미설정. 서버 호출 계층과 설정 계약도 새로 추가해야 합니다.
- develop의 `007-github-webhook.sql`과 main의 `007-project-database.sql`은 별개 파일입니다. 현재 migrate 스크립트는 전체 파일명으로 이력을 관리하므로 번호가 같다고 자동 충돌하는 방식은 아닙니다. 통합할 때 번호/문서를 정리하고 둘 다 적용해야 합니다.
- 이번 작업에서는 DB 변경·서버 재시작·실제 배포·테스트·웹훅 병합을 수행하지 않았습니다.

### 구체적인 근거 파일

- 프런트: `src/lib/builder/{worker,run}.ts`, `src/lib/deploy/realDeploy.ts`, `src/lib/projects/{schema,server,types,detect}.ts`, `src/lib/agents/server.ts`, `src/components/projects/AgentPanel.tsx`.
- 웹훅: develop의 `src/lib/github/webhook.ts`, `src/app/api/github/webhook/route.ts`.
- 관측 계약: [AppMetricsController](https://github.com/SoftBank-team-lily/lily-observer/blob/d2cdd8763e61802e1b4196b587a4060932e20204/src/main/java/com/lily/observer/api/AppMetricsController.java), [AppLogsController](https://github.com/SoftBank-team-lily/lily-observer/blob/d2cdd8763e61802e1b4196b587a4060932e20204/src/main/java/com/lily/observer/api/AppLogsController.java), [ClusterController](https://github.com/SoftBank-team-lily/lily-observer/blob/d2cdd8763e61802e1b4196b587a4060932e20204/src/main/java/com/lily/observer/api/ClusterController.java), [AppStatusController](https://github.com/SoftBank-team-lily/lily-observer/blob/d2cdd8763e61802e1b4196b587a4060932e20204/src/main/java/com/lily/observer/api/AppStatusController.java).
- 배포 요청/자동 조합: builder의 `BuildRequest.java`, `BuildService.java`, `DockerfileGenerator.java`.
- 롤백/라우팅: CI/CD의 `deploy/DeployController.java`, `config/ModuleConfiguration.java`, 새 ingress의 `route/RouteController.java`·README.
- 로컬 대시보드: `app/page.tsx`, `components/Dashboard.tsx`, `lib/api.ts`, `lib/types.ts`, `docs/api-contract.md`, `docs/real-deployment-tasks.md`.
