# Lily

파티클 백합 랜딩과 로그인·회원가입·본인 계정·프로젝트 관리 앱입니다. Next.js 서버에서 인증·프로젝트·배포 기록 API를 제공하며 PostgreSQL에 저장합니다. 공개 랜딩의 6단계 배포 시연은 실제 배포를 실행하지 않습니다.

## 실행

Node.js 24 이상, pnpm 12.8.1, Docker Compose가 필요합니다.

```sh
corepack enable
pnpm install
pnpm setup
pnpm db:start
pnpm db:migrate
pnpm dev
```

기본 개발 서버는 http://localhost:3000 입니다. `pnpm setup`은 무작위 비밀키를 포함한 `.env.local`을 생성하며 기존 파일은 덮어쓰지 않습니다. 이 파일은 Git에 포함하지 않습니다.

현재 작업 환경은 **http://localhost:3210**으로 실행 중입니다. 다른 포트를 쓰면 `.env.local`의 `BETTER_AUTH_URL`·`AUTH_TRUSTED_ORIGINS`도 같은 주소로 맞추고 `pnpm dev --hostname 127.0.0.1 --port 3210`으로 실행합니다.

개발 DB는 `localhost:5438`, 인증·비밀번호 복구 메일은 **http://localhost:8026**의 Mailpit에서 확인합니다. 회원가입 후 인증 메일의 링크를 열어야 로그인할 수 있습니다. Docker DB는 영속 볼륨에 저장합니다.

프로덕션 실행은 운영용 DB·SMTP·HTTPS 인증 URL·비밀키를 설정하고 마이그레이션한 뒤 `pnpm build`·`pnpm start`를 사용합니다. 환경 변수 목록은 [.env.example](.env.example)을 참고하세요.

## 검사

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

- `pnpm test:watch`: Vitest 감시 모드.
- `pnpm lint`: ESLint와 색상 하드코딩 검사.
- `pnpm test:e2e`: Chromium 화면 비교·꽃·접근성 검사, WebKit 모바일 배포 흐름. 테스트가 전용 3210 포트에 서버를 실행하므로 해당 포트는 비워 두세요.
- `pnpm exec playwright show-report`: 브라우저 검사 결과와 비교 이미지 확인.
- `node scripts/extract-flower-mask.mjs`: 기준 HTML에서 꽃 마스크 재추출.

화면 비교는 같은 브라우저의 기준 HTML과 앱을 직접 비교합니다. DOM 비교에서는 꽃만 숨기고, 꽃 검사는 실제 WebGL로 진행합니다. 기준 HTML의 폰트를 받기 위한 Google Fonts 연결과 첫 빌드의 폰트 다운로드에 인터넷이 필요합니다.

## 구조

- `src/components`: 공통 UI, 배포 표현, 랜딩 조립, 꽃 캔버스.
- `src/lib/deploy`: 이벤트 시뮬레이션·리듀서·취소 가능한 훅.
- `src/lib/auth`: 서버 인증·메일·세션과 클라이언트 연결.
- `src/lib/projects`: 본인 프로젝트·배포 기록·진입 권한 처리.
- `src/app/api`: 인증·프로젝트·실행기 이벤트 API.
- `db/migrations`, `scripts/migrate.ts`: PostgreSQL 스키마와 마이그레이션.
- `src/lib/three/flower`: 순수 입자 생성과 씬 수명주기.
- `src/app/globals.css`: UI와 꽃 색상·타이포그래피 토큰의 단일 원천.

꽃은 별도 번들로 로드됩니다. React는 목표값만 전달하고 프레임 계산은 `FlowerScene`이 수행합니다. WebGL 초기화가 불가능해도 배포 폼은 사용할 수 있습니다.

## 실제 배포 (클라우드 / 온프레미스)

`/account` 에서 레포를 등록하면 서버 안의 실행기(`src/lib/builder`, `src/instrumentation.ts`)가 lily-builder 로 배포한다. `BUILDER_URL` 이 없으면 실행기는 꺼진다.

- **배포 위치**: 클라우드는 Lily 클러스터, 온프레미스는 사용자 PC 의 에이전트(lily-on-premise)
- **온프레미스 연결**: "연결 토큰 받기" → 화면의 명령(`scripts/agent.sh`)을 PC 에서 실행 → "연결됨" 이 보이면 등록할 수 있다. 온프레미스 프로젝트는 계정당 하나
- **상태**: 목록이 배포 중에는 4초마다 다시 읽는다. 완료되면 "앱 열기", 실패하면 이유 한 줄과 "다시 배포"
- **DB 확인**: 등록할 때 lily-builder 가 감지한 DB(`POST /api/detect`)를 "감지된 DB" 드롭다운에 골라 두고, 사용자가 바꾼 뒤 생성한다. 감지하지 못하면 "없음". 등록한 뒤에는 바꿀 수 없다 (`projects.database`)
- 포트·헬스 경로는 lily-builder 가 레포를 보고 정한다. DB 를 고르기 전에 등록한 프로젝트는 `BUILDER_DATABASE=auto`

| 테이블 | 내용 |
|---|---|
| `projects.target` | `cloud` / `onprem` |
| `agents` | 사용자별 에이전트 key (토큰은 저장하지 않음) |
| `builder_runs` | 배포 ↔ lily-builder 빌드, 결과 주소(`url`), 결과 한 줄(`message`) |

## 대시보드 진입 연결

배포가 성공한 뒤 꽃을 클릭하면 꽃술로 카메라가 확대되고, 마지막 페이드가 끝날 때
`LandingPage`의 선택적 `onEnterDashboard(entry)` 콜백을 실행합니다.
hover 시 클릭 영역의 배경·테두리는 표시하지 않습니다. 키보드 포커스만 표시합니다.
배포 전·진행 중·롤백 후에는 진입을 막고, 확대 중 Escape로 취소할 수 있습니다.

`entry`는 `{ source: "flower", result: DeployResult & { outcome: "succeeded" }, projectId?: string }`입니다.
연결 콜백에는 성공한 프로젝트의 결과를 반드시 전달합니다.
`onComplete(result)`는 기존 배포 종료 이벤트이고, 대시보드 이동은 따로 연결합니다.

실제 연결은 Client Component에서 합니다. 같은 앱이면 `next/navigation`의
`router.push(확정된 경로)`를 콜백에서 실행하고, 외부 앱이면 확정된 URL로 이동합니다.
Server Component인 `app/page.tsx`에서 일반 함수 콜백을 직접 넘기지 않습니다.
비동기 연결은 Promise를 반환해 이동 작업이 끝날 때까지 기다릴 수 있습니다.

실제 프로젝트는 `/account`에서 선택합니다. 최신 배포가 성공한 본인 프로젝트만
`/?project=<ID>`로 열 수 있으며 꽃 클릭 전에 서버가 소유권·배포 상태를 다시 확인합니다.
공개 시연 결과에는 실제 진입 권한을 부여하지 않습니다. 미로그인 상태에서 시연 꽃을
클릭하면 확대 전에 로그인 화면으로 이동합니다.

`DASHBOARD_URL`에 목적지를 설정하면 확대 후 다시 권한을 확인하고 이동합니다.
현재 목적지는 미설정이며 “대시보드 연결 준비 중입니다.”를 표시하고 복귀합니다.
콜백 실패 시에도 복귀하며 배포 결과를 유지합니다.
모션 감소 설정에서는 확대를 생략합니다. 꽃 로딩·WebGL 오류 시에는
“대시보드로 이동” 대체 버튼을 사용합니다.

배포 API는 대기 기록 생성과 실행기 상태 수신까지 구현했습니다. 실제 배포 실행 엔진,
대시보드 UI, 외부 대시보드 SSO는 아직 연결하지 않았습니다.

## 인프라 연동 검토

팀 피드백의 이메일 인증 생략·배포 설정 확대·Dockerfile 자동 생성·조직 제한 해제 연동은
[후속 태스크 계획 T19~T29](docs/DEPLOY.md)에 분류했습니다. 아래 내용은 현재 구현 기준이며,
새 인증 정책과 배포 설정은 아직 적용하지 않았습니다.

**현재 구조는 Nginx 뒤에서 UI·API를 함께 운영하고 외부 배포 실행기를 붙일 수 있는 기반입니다.**
다만 실제 배포 요청 전달·진행률 수신까지 연결된 상태는 아닙니다. 아래 내용은 코드 검토 결과이며,
운영 Nginx·실행기와의 통합 동작은 아직 검증하지 않았습니다.

| 연결 대상         | 현재 준비된 부분                                                 | 추가로 필요한 부분                                                |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Nginx·도메인·TLS  | UI와 `/api`를 같은 Next.js 서버에서 제공, 상대 경로 요청         | 도메인·인증서·프록시 설정·운영 프로세스 관리                      |
| PostgreSQL·메일   | 환경 변수로 DB·SMTP 교체, 마이그레이션 제공                      | 운영 DB·SMTP·백업·연결 수 관리                                    |
| 배포 실행기       | 대기 기록 생성, 서버 전용 이벤트 API, 중복 이벤트·상태 전환 처리 | 실행기로 작업 전달, 실행기 인증·작업 선점·실패 복구               |
| 실제 배포 UI      | 프로젝트 등록·상태 표시·성공 프로젝트 꽃 진입                    | 실제 배포 시작 버튼, 상태 자동 갱신·진행률 API                    |
| 대시보드          | 꽃 전환 콜백, 서버 소유권 확인, `DASHBOARD_URL`                  | 대상 앱·세션 검증·외부 앱 SSO                                     |
| 컨테이너·모니터링 | 개발용 DB·Mailpit Compose                                        | 앱 Dockerfile·운영 Compose/배포 명세·상태 점검 API·로그/지표 수집 |

### 권장 배치와 담당 경계

```text
브라우저 → HTTPS Nginx → Lily Next.js (UI + /api)
                              ├→ PostgreSQL
                              ├→ SMTP
                              └→ 작업 큐 → 배포 실행기   [추가 구현]
                                             └→ Lily 실행기 이벤트 API
꽃 진입 → 대시보드 URL                        [대상 앱 연동]
```

초기에는 **하나의 공개 도메인에서 UI와 API를 함께 제공**하는 구성이 현재 코드에 가장 잘 맞습니다.
예를 들어 `https://lily.example.com`의 `/`, `/account`, `/api/auth/*`, `/api/projects/*`,
`/_next/*`, `public` 파일 경로를 모두 Lily Next.js로 전달합니다.
정적 HTML만 Nginx에 복사하면 인증·프로젝트 API와 서버 페이지가 동작하지 않습니다.
현재 앱은 `next build`·`next start`로 실행하는 Node.js 서비스입니다.

| 담당        | 연결할 위치                                                                                                     | 계약                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 인프라      | Nginx·Node 프로세스·환경 변수·DB·SMTP                                                                           | 공개 HTTPS URL과 내부 서비스 주소를 구분    |
| API         | [배포 기록 생성](src/app/api/projects/[id]/deployments/route.ts), [프로젝트 서비스](src/lib/projects/server.ts) | 세션 소유권 확인 후 기록 생성, 향후 큐 전달 |
| 실행기      | [이벤트 API](src/app/api/internal/deployments/[id]/events/route.ts)                                             | 배포 UUID·고유 이벤트 ID·허용 상태를 전달   |
| UI          | [프로젝트 항목](src/components/projects/ProjectItem.tsx), [API 클라이언트](src/lib/projects/client.ts)          | 실제 배포 버튼·상태 갱신을 추가할 위치      |
| 꽃·대시보드 | [HomeClient](src/components/landing/HomeClient.tsx), [LandingPage](src/components/landing/LandingPage.tsx)      | 권한 확인·이동과 꽃 표현을 분리             |

브라우저 요청은 `credentials: "same-origin"`이고 인증 클라이언트도 같은 출처를 사용합니다.
API를 다른 도메인으로 분리하려면 클라이언트 주소·쿠키·CORS·Origin 정책과 서버 페이지의
직접 DB 조회까지 함께 변경해야 합니다. Nginx에서 `/api`만 임의의 다른 백엔드로 돌리는 방식은
현재 인증·데이터 계약과 맞지 않습니다. `/lily` 같은 하위 경로 배치도 `basePath`와 하드코딩된
절대 경로를 수정해야 하므로 현재는 도메인의 루트 경로 배치를 권장합니다.

### 운영 환경 변수와 실행

| 변수                    | 설정 방법                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | 운영 PostgreSQL 연결 문자열. TLS·CA는 DB 제공자의 정책에 맞춤                                             |
| `BETTER_AUTH_URL`       | 사용자가 방문하는 공개 URL, 예: `https://lily.example.com`. 내부 `http://127.0.0.1:3000` 주소를 넣지 않음 |
| `AUTH_TRUSTED_ORIGINS`  | 허용하는 브라우저 Origin을 쉼표로 구분. 기본은 공개 Lily URL. 경로를 붙이지 않음                          |
| `BETTER_AUTH_SECRET`    | 32자 이상의 무작위 비밀키. 재시작·복제 인스턴스에서 동일하게 유지                                         |
| `SMTP_URL`, `MAIL_FROM` | 운영 SMTP 연결 문자열·인증된 발신 주소. Mailpit은 개발용                                                  |
| `DEPLOYMENT_API_KEY`    | 인증 비밀키와 별개의 32자 이상 무작위 키. Lily 서버와 실행기에서만 공유                                   |
| `DASHBOARD_URL`         | 선택 사항. 운영은 HTTPS 대상 URL. 미설정 시 꽃 확대 후 준비 중 안내                                       |

비밀값은 배포 플랫폼의 환경 변수·Secret으로 주입합니다. `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.
현재 서버 모듈이 로딩될 때 `DATABASE_URL`·`BETTER_AUTH_URL`·`BETTER_AUTH_SECRET`을 검사하므로
**빌드 단계에도 이 값이 필요합니다.** 런타임에도 운영 값을 주입하고, 변경 시 프로세스를 재시작합니다.
DB 스키마 변경은 앱의 자동 시작 과정이 아니라 별도 배포 단계에서 실행합니다.

호스트에 Nginx와 Lily를 함께 설치하는 예시입니다. 명령 실행 전에 환경 변수를 주입합니다.

```sh
pnpm install --frozen-lockfile
pnpm build
# 배포 작업 환경에서 실행. 외부 환경 변수를 쓰므로 .env.local은 필요 없음.
node --conditions=react-server --import tsx scripts/migrate.ts
pnpm start --hostname 127.0.0.1 --port 3000
```

systemd·컨테이너 오케스트레이터 등으로 앱 재시작과 종료를 관리합니다.
마이그레이션 작업에는 `tsx`, `scripts/migrate.ts`, `db/migrations`가 필요하므로
현재는 개발 의존성까지 설치한 배포 작업에서 수행합니다. `pnpm db:migrate`는
`.env.local`을 읽는 로컬 개발용 명령입니다.

컨테이너끼리 연결할 때는 Nginx upstream을 `web:3000` 같은 서비스 이름으로 바꾸고
앱은 `0.0.0.0:3000`에 바인딩합니다. 앱 컨테이너 안의 `localhost`는 DB 컨테이너가 아닙니다.
예를 들어 같은 Compose 네트워크의 DB 연결은 `db:5432`, 개발 메일은 `mail:1025`입니다.
현재 `compose.yaml`에는 앱·Nginx 서비스가 없습니다.

작은 운영 이미지를 만들려면 `next.config.ts`에 `output: "standalone"`을 추가한 뒤
Dockerfile에서 `.next/standalone`, `.next/static`, `public`을 복사하고 `node server.js`로 실행하는
구성을 추가할 수 있습니다. 이 설정과 Dockerfile은 아직 적용하지 않았습니다.

### Nginx 예시

다음은 **Nginx가 직접 TLS를 종료하고 같은 호스트의 Lily에 전달**하는 예시입니다.
`lily.example.com`, 인증서 경로, 실행기 IP `10.20.0.15`를 실제 값으로 바꿉니다.
`log_format`·`upstream`·`server` 블록은 Nginx `http` 문맥 안에 둡니다.

```nginx
# 메일 인증·복구 토큰이 들어 있는 query string은 접근 로그에 기록하지 않음.
log_format lily '$remote_addr $request_method $uri $status $request_time';

upstream lily_web {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name lily.example.com;
    return 308 https://lily.example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name lily.example.com;
    ssl_certificate /etc/letsencrypt/live/lily.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lily.example.com/privkey.pem;

    access_log /var/log/nginx/lily-access.log lily;
    client_max_body_size 16k;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Forwarded "";
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 60s;

    # 실행기 전용 API: 실제 실행기의 접속 원본 IP/네트워크로 교체.
    # 애플리케이션의 Bearer 키 검사도 계속 적용됨.
    location ^~ /api/internal/ {
        allow 127.0.0.1;
        allow 10.20.0.15;
        deny all;
        proxy_pass http://lily_web;
    }

    location / {
        proxy_pass http://lily_web;
    }
}
```

- `proxy_pass`에 경로 재작성 없이 원래 URI를 전달합니다. `/api`와 `/_next`를 제거하지 않습니다.
- 원래 `Cookie`, `Origin`, `Authorization`, `Idempotency-Key`와 응답 `Set-Cookie`를 보존합니다.
  Origin을 내부 주소로 덮어쓰거나 인증 쿠키의 Secure 속성을 제거하지 않습니다.
- 인증된 페이지·API를 공유 프록시 캐시에 저장하지 않습니다. 정적 파일 캐시는 나중에
  `/_next/static/*`에 한정해 추가할 수 있으며, 처음에는 위처럼 전체 프록시 캐시를 끕니다.
- 현재 Better Auth 1.7.6의 기본 IP 입력은 `X-Forwarded-For`입니다. 단일 Nginx 예시에서는
  클라이언트가 보낸 값을 이어 붙이지 않고 `$remote_addr`로 덮어씁니다. 앱 포트는 Nginx에서만 접근합니다.
- 앞단에 ALB·CDN이 있으면 이 예시를 그대로 쓰기보다 신뢰할 프록시 주소와 real IP 복원 정책을
  먼저 정합니다. TLS가 앞단에서 종료되면 공개 스킴을 `https`로 전달하고, 실행기 ACL에도
  실제로 관측되는 원본 IP를 반영해야 합니다.
- 앱의 JSON 요청 제한은 16KiB입니다. 향후 파일 업로드 API나 긴 실행기 로그를 추가할 때는
  프록시·앱 양쪽의 크기 제한과 별도 업로드 경로를 함께 설계합니다.

프록시·헤더·스트리밍 설정의 근거는 [Nginx 프록시 문서](https://nginx.org/en/docs/http/ngx_http_proxy_module.html),
[Next.js 자체 호스팅 문서](https://nextjs.org/docs/app/guides/self-hosting)를 참고합니다.
인증 IP·쿠키 설정은 [Better Auth 옵션](https://better-auth.com/docs/reference/options)을 참고합니다.

### 배포 실행기 연결 계약

현재 공개 랜딩의 `useDeploy`는 `simulateDeploy`를 실행합니다. Nginx를 연결해도 실제 배포가
시작되지는 않습니다. 실제 실행 흐름은 다음 순서로 연결하는 것을 권장합니다.

1. 계정 화면의 프로젝트에 실제 배포 버튼을 추가하고 로그인 세션으로
   `POST /api/projects/:id/deployments`를 호출합니다. 본문은 `{}`, `Idempotency-Key`는
   사용자 배포 요청별로 만든 고유 키입니다. 재시도에는 같은 키를 사용합니다.
2. API는 소유권을 확인한 뒤 `queued` 기록을 만듭니다. **현재는 여기서 멈춥니다.**
   기록 생성과 큐 전달을 연결하려면 같은 DB 트랜잭션에 발송 대기 항목(outbox)을 저장하고
   전달 담당 작업이 큐에 보내는 구조를 권장합니다. 기록 저장 후 큐 전달이 실패해도 재시도할 수 있습니다.
3. 실행기는 `deploymentId`, `projectId`, `repo`를 받아 작업을 선점하고 수행합니다.
   큐 메시지 재수신 시 같은 배포를 중복 실행하지 않도록 실행기에서도 처리합니다.
   현재 실행기용 전역 대기 목록·작업 선점 API는 없으며 `/api/projects`는 사용자 세션 전용입니다.
4. 실행기는 다음 요청으로 실제 결과를 전달합니다. 사용자 쿠키 대신 서버 전용 키를 사용합니다.

   ```http
   POST /api/internal/deployments/<deploymentId>/events
   Authorization: Bearer <DEPLOYMENT_API_KEY>
   Content-Type: application/json

   {"eventId":"<재전송해도 유지하는 이벤트 ID>","status":"running"}
   ```

5. 허용 전환은 `queued → running / failed`, `running → succeeded / failed`,
   `succeeded / failed → rolled-back`입니다. 같은 이벤트 ID·상태는 중복 반영하지 않고,
   같은 ID에 다른 상태나 역순 상태 전환은 409를 반환합니다. 전송 순서를 유지하며 재시도합니다.
6. UI는 프로젝트·배포 기록을 다시 조회합니다. 현재는 `/account`의 수동 새로고침이며,
   자동 갱신은 polling 또는 SSE를 추가합니다. 최신 배포가 `succeeded`일 때 꽃 진입이 가능합니다.

현재 배포 데이터에는 **전체 상태만** 있습니다. 6단계 꽃 진행률, 단계별 로그, 서비스 URL,
커밋 SHA, 도메인·인증서 정보는 저장·수신하지 않습니다. 실행기가 이 정보를 제공하려면
DB·이벤트 스키마·API 응답부터 확장한 뒤 `deployReducer`와 꽃 목표값에 연결합니다.
도메인·Nginx 상태 같은 사용자별 인프라 정보도 프로젝트 소유권 검사 아래 별도 API로 추가합니다.
GitHub 레포 등록은 저장소 접근 권한을 부여하지 않으므로 비공개 레포 배포에는 실행기 측
GitHub App 설치 또는 별도 GitHub 자격 증명·권한 연동이 필요합니다. 상세 계약은 [API.md](docs/API.md)를 따릅니다.

### 대시보드와 운영 보완 순서

`DASHBOARD_URL=https://dashboard.example.com`을 설정하면 꽃 확대 후
`https://dashboard.example.com/?project=<UUID>`로 이동합니다. 기존 URL 경로·쿼리는 유지합니다.
이 설정은 이동 주소만 연결하며 로그인 SSO를 구성하지 않습니다. 현재 쿠키는 Lily 호스트 전용이고,
대상 앱은 프로젝트 ID를 받은 뒤 별도로 세션·소유권을 검증해야 합니다.
같은 도메인의 `/dashboard`에 별도 앱을 프록시하더라도 Next.js 기본 라우팅·쿠키 정책·대상 앱의
권한 검증을 함께 정해야 합니다. 대상 UI 라우트는 아직 없습니다.

운영 연결 작업은 다음 순서가 적합합니다.

1. 공개 도메인·TLS·Nginx·운영 DB·SMTP를 준비하고 회원가입·인증 메일·로그인 흐름을 연결합니다.
2. 실제 배포 버튼 → 기록/outbox → 큐 → 실행기를 연결하고 이벤트를 받아 상태를 갱신합니다.
3. 상태 자동 갱신·진행률·로그 계약을 추가하고 기존 꽃 표현에 실제 데이터를 전달합니다.
4. 대시보드 목적지와 대상 앱의 인증·소유권 검증을 연결합니다.
5. 운영용 Dockerfile/배포 명세, liveness·DB readiness API, 로그·지표와 백업을 추가합니다.

현재 상태 점검 전용 API는 없습니다. `/login` 응답은 HTTP 서비스 확인에만 사용할 수 있고
DB 가용성 확인을 대신하지 않습니다. DB 풀은 프로세스당 최대 10개 연결로 고정되어 있으므로
복제 개수·DB 한도에 맞춰 [db.ts](src/lib/db.ts)의 설정이나 연결 풀러를 조정합니다.
복제 인스턴스는 같은 DB·인증 비밀키를 공유하고 같은 빌드 산출물을 사용합니다.
메일 발송은 Next.js `after`로 처리되며 영속 작업 큐가 아니므로 재시작을 견디는 발송 보장이
필요하면 별도 메일 큐를 추가합니다. DB의 요청 제한·만료 인증 데이터 보존·정리 정책도 운영 작업으로 정합니다.

## 문서

- [구현 계획](docs/PLAN.md)
- [꽃 확대·대시보드 연결](docs/DASHBOARD.md)
- [로그인·회원가입·사용자별 관리 태스크](docs/AUTH.md)
- [계정·프로젝트 API 계약](docs/API.md)
- [팀 피드백·실제 배포 연결 태스크](docs/DEPLOY.md)
- [디자인 규칙](docs/DESIGN.md)
- [검증 결과와 남은 확인](docs/QA.md)
- [기준 화면](docs/reference/landing.html)
