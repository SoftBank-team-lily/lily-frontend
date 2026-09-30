# Lily

레포 주소를 입력하면 6단계 배포 시뮬레이션에 맞춰 파티클 백합에 색이 번지는 랜딩 페이지입니다. 롤백 시연과 다시 배포하기를 지원하며 실제 배포 API는 호출하지 않습니다.

## 실행

Node.js 24 이상과 pnpm 12.8.1을 사용합니다.

```sh
corepack enable
pnpm install
pnpm dev
```

개발 서버는 http://localhost:3000 입니다. 프로덕션 실행은 `pnpm build` 후 `pnpm start`를 사용합니다.

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
- `src/lib/three/flower`: 순수 입자 생성과 씬 수명주기.
- `src/app/globals.css`: UI와 꽃 색상·타이포그래피 토큰의 단일 원천.

꽃은 별도 번들로 로드됩니다. React는 목표값만 전달하고 프레임 계산은 `FlowerScene`이 수행합니다. WebGL 초기화가 불가능해도 배포 폼은 사용할 수 있습니다.

## 대시보드 진입 연결

배포가 성공한 뒤 꽃을 클릭하면 꽃술로 카메라가 확대되고, 마지막 페이드가 끝날 때
`LandingPage`의 선택적 `onEnterDashboard(entry)` 콜백을 실행합니다.
hover 시 클릭 영역의 배경·테두리는 표시하지 않습니다. 키보드 포커스만 표시합니다.
배포 전·진행 중·롤백 후에는 진입을 막고, 확대 중 Escape로 취소할 수 있습니다.

`entry`는 `{ source: "flower", result: DeployResult & { outcome: "succeeded" } }`입니다.
연결 콜백에는 성공한 프로젝트의 결과를 반드시 전달합니다.
`onComplete(result)`는 기존 배포 종료 이벤트이고, 대시보드 이동은 따로 연결합니다.

실제 연결은 Client Component에서 합니다. 같은 앱이면 `next/navigation`의
`router.push(확정된 경로)`를 콜백에서 실행하고, 외부 앱이면 확정된 URL로 이동합니다.
Server Component인 `app/page.tsx`에서 일반 함수 콜백을 직접 넘기지 않습니다.
비동기 연결은 Promise를 반환해 이동 작업이 끝날 때까지 기다릴 수 있습니다.

현재 목적지와 콜백은 연결하지 않았습니다. “대시보드 연결 준비 중입니다.”를
표시하고 랜딩으로 복귀합니다. 콜백 실패 시에도 복귀하며 배포 결과를 유지합니다.
모션 감소 설정에서는 확대를 생략합니다. 꽃 로딩·WebGL 오류 시에는
“대시보드로 이동” 대체 버튼을 사용합니다.

## 문서

- [구현 계획](docs/PLAN.md)
- [꽃 확대·대시보드 연결](docs/DASHBOARD.md)
- [로그인·회원가입·사용자별 관리 태스크](docs/AUTH.md)
- [디자인 규칙](docs/DESIGN.md)
- [검증 결과와 남은 확인](docs/QA.md)
- [기준 화면](docs/reference/landing.html)
