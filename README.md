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

## 문서

- [구현 계획](docs/PLAN.md)
- [꽃 확대·대시보드 연결](docs/DASHBOARD.md)
- [로그인·회원가입·사용자별 관리 태스크](docs/AUTH.md)
- [계정·프로젝트 API 계약](docs/API.md)
- [디자인 규칙](docs/DESIGN.md)
- [검증 결과와 남은 확인](docs/QA.md)
- [기준 화면](docs/reference/landing.html)
