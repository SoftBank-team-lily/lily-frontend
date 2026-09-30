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

꽃은 별도 번들로 로드됩니다. React는 목표값만 전달하고 프레임 계산은 `FlowerScene`이 수행합니다. `LandingPage`의 선택적 `onComplete(result)` 콜백으로 향후 대시보드를 연결할 수 있습니다. WebGL 초기화가 불가능해도 배포 폼은 사용할 수 있습니다.

## 문서

- [구현 계획](docs/PLAN.md)
- [디자인 규칙](docs/DESIGN.md)
- [검증 결과와 남은 확인](docs/QA.md)
- [기준 화면](docs/reference/landing.html)
