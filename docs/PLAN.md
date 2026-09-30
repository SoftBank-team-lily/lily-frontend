# Lily 랜딩 구현 계획

Artifact로 만든 랜딩 화면을 **Next.js + Tailwind CSS + three.js**로 똑같이 옮기는 계획입니다.

- **기준**: [`docs/reference/landing.html`](./reference/landing.html) (Artifact v9). 이 문서의 줄 번호(`L123`)는 모두 이 파일 기준입니다.
- **색·타이포·모션 규칙**: [`docs/DESIGN.md`](./DESIGN.md)
- **"똑같다"의 판정**: §7 검증 전략의 스크린샷 비교(DOM 레이어)와 꽃 연출 체크리스트를 통과하면 완료입니다.

---

## 0. 한눈에 보기

| ID | 태스크 | 끝나면 되는 것 | 의존 |
|---|---|---|---|
| T0 | 계획·규칙 문서 | 이 문서, DESIGN.md, 기준 HTML이 레포에 있음 | — |
| T1 | 프로젝트 스캐폴딩 | `pnpm dev`로 빈 검은 페이지, lint·typecheck·test 통과 | T0 |
| T2 | 디자인 토큰·폰트·기본 스타일 | 토큰 유틸리티 사용 가능, 색상 하드코딩 자동 검사 | T1 |
| T3 | UI 프리미티브·정적 레이아웃 | 동작 없는 정적 화면이 기준과 픽셀 비교 통과 | T2 |
| T4 | 도메인 로직 (레포 파싱·배포 시뮬레이션) | UI 없이 배포 타임라인 단위 테스트 통과 | T1 |
| T5 | 배포 인터랙션 연결 | 꽃 없이 입력→배포→완료/롤백→다시 배포 전체 흐름 동작 | T3, T4 |
| T6 | 꽃 씬 순수 모듈 | 에셋·토큰 리더·셰이더·파티클 빌더·카메라 맞춤 + 테스트 | T2 |
| T7 | 꽃 씬 런타임·캔버스 | 꽃이 기준과 같이 모이고 반응함, StrictMode에서 누수 없음 | T6 |
| T8 | 꽃↔배포 연결 | 진행에 따라 색이 번지고, 롤백 시 시듦 | T5, T7 |
| T9 | 동등성 QA·마감 | §7 검증 전부 통과, README 정리 | T8 |

- **병렬 진행**: T3 ∥ T4, T6·T7 ∥ T3~T5
- **커밋 단위**: 태스크당 PR 하나(`develop` 대상)이고, PR 안의 커밋은 각 태스크의 "커밋" 항목을 따릅니다.
- **커밋 메시지**: Conventional Commits 형식, 설명은 한국어로 씁니다.

---

## 1. 목표와 범위

**포함**
- 랜딩 한 화면: 파티클 백합, 히어로 문구, 레포 입력 폼, 롤백 시연 옵션, 6단계 배포 시뮬레이션, 완료·롤백 결과, 다시 배포하기
- 반응형(모바일 세로·가로), `prefers-reduced-motion`, safe-area

**제외**
- **모니터링 대시보드**: 만들지 않습니다. 대신 배포 완료 후 대시보드로 넘어갈 수 있게 연결 지점(§5.4)만 설계합니다.
- 실제 배포 API, 인증

---

## 2. 기술 스택

2026-09-30 `npm view`로 확인한 버전입니다.

| 영역 | 선택 | 버전 | 비고 |
|---|---|---|---|
| 프레임워크 | Next.js (App Router, `src/`) | 16.3.x | React 19.3 |
| 언어 | TypeScript | 최신 | strict |
| 스타일 | Tailwind CSS v4 (`@tailwindcss/postcss`) | 4.3.x | CSS 우선 설정(`@theme`), `tailwind.config` 없음 |
| 3D | three (+ `@types/three`) | 0.186.x | 원본은 CDN r128. npm으로 번들하므로 SRI 대신 lockfile 무결성으로 보장 |
| 폰트 | `next/font/google` IBM Plex Sans KR | — | 400·600, `display: swap`, 자체 호스팅 |
| 패키지 매니저 | pnpm (corepack) | 12.x | Node 24 |
| 테스트 | Vitest + Testing Library, Playwright | 최신 | 단위·컴포넌트 / 동등성 스크린샷 |

**결정과 이유**
- **three는 react-three-fiber 없이 직접 씁니다.** 원본이 명령형 루프 하나라서, 클래스(`FlowerScene`)로 옮기는 게 가장 똑같이 재현하기 쉽습니다. React는 캔버스 수명주기와 목표값 전달만 맡습니다.
- **꽃 캔버스는 `next/dynamic({ ssr: false })`로 나눠 불러옵니다.** 원본도 폼이 먼저 보이고 three.js는 뒤에 로드됐습니다. three 번들 때문에 폼 등장(1.4초)이 늦어지면 안 됩니다.

**확인한 호환성**
- **`gl_FragColor`**: three 0.186의 `WebGLProgram`이 GLSL3가 아닌 셰이더에 `#define gl_FragColor pc_fragColor`를 넣어 줍니다. 원본 셰이더를 그대로 쓸 수 있습니다.
- **`IBM Plex Sans KR`**: `next/font` 폰트 목록에 있습니다(weights 100~700). subsets는 `latin`·`latin-ext`뿐이므로 한글 글리프가 실제로 Plex로 렌더링되는지 T2에서 확인합니다.
- **색 관리**: three 0.186은 ColorManagement가 기본으로 켜져 있고 `outputColorSpace`가 sRGB입니다. `ShaderMaterial`은 `colorspace_fragment`를 include하지 않으면 출력을 변환하지 않으므로 원본과 같습니다. 단, 색을 `THREE.Color`로 만들면 선형으로 바뀝니다(DESIGN.md §2.2).
- **Tailwind 테마 변수**: v4는 쓰인 테마 변수만 출력합니다. 그래서 JS만 읽는 꽃 팔레트는 `@theme` 밖의 일반 `:root`에 둡니다.

---

## 3. 폴더 구조

```
src/
  app/
    layout.tsx                 # html lang="ko", 폰트 변수, metadata/viewport
    page.tsx                   # 랜딩 (서버 컴포넌트 → LandingPage 조립)
    globals.css                # 모든 토큰의 단일 원천 + base 스타일
  components/
    ui/                        # 도메인을 모르는 재사용 부품 (대시보드에서도 사용)
      Button.tsx               #   variant: primary | ghost
      TextField.tsx
      OptionCheckbox.tsx
      SegmentedProgress.tsx    #   n칸 진행바, 칸별 채움 비율, 실패 칸
    layout/
      SiteNav.tsx              #   고정 상단 내비 (오른쪽 slot은 대시보드용)
      Reveal.tsx               #   지연 후 자식들을 페이드업
    deploy/                    # 배포 도메인 표현 (대시보드에서도 사용)
      DeployForm.tsx
      DeployStatus.tsx         #   진행바 + 현재 단계 줄 + 결과 문구 + 다시 배포
    flower/
      FlowerCanvas.tsx         #   'use client', dynamic(ssr:false) 진입점
      FlowerCanvasClient.tsx   #   캔버스 + FlowerScene 수명주기
    landing/
      LandingPage.tsx          #   'use client', 배포 상태와 꽃 목표값 연결
  lib/
    design/readColorToken.ts   # CSS 변수 → [r,g,b] (변환 없음)
    motion.ts                  # 등장 지연 등 UI 모션 상수
    hooks/usePrefersReducedMotion.ts
    repo/parseRepo.ts          # 입력 → "owner/repo" | null
    repo/toSlug.ts             # "owner/Repo.js" → "repo-js"
    deploy/
      types.ts                 # RepoRef, DeployEvent, DeployState, DeployResult
      stages.ts                # 6단계 정의(이름·시간), 실패 시점 등 상수
      simulateDeploy.ts        # 이벤트를 내보내는 시뮬레이션 드라이버
      deployReducer.ts         # 이벤트 → 상태, 상태 → 꽃 목표값
      useDeploy.ts             # 훅: start / reset / 취소
    three/
      damp.ts                  # 지수 감쇠 공통 함수
      flower/
        config.ts              # FLOWER 치수, FLOWER_MOTION, 파티클 상수
        shaders.ts             # vert/frag (원본 그대로 + 색 uniform화)
        particles.ts           # 마스크 → 꽃/먼지 attribute 배열 (THREE 비의존)
        material.ts            # 공통 ShaderMaterial·Geometry 생성
        fitView.ts             # 빈 공간(slot)에 꽃을 맞추는 카메라 계산 (순수 함수)
        FlowerScene.ts         # renderer·camera·loop·입력·resize·dispose
public/
  flower-mask.png              # 187×187 8bit 그레이스케일 (기준 HTML의 base64에서 추출)
scripts/
  check-design-tokens.mjs      # 색상 하드코딩 검사 (lint에 연결)
  extract-flower-mask.mjs      # 기준 HTML → public/flower-mask.png (재현 가능하게)
e2e/
  parity.spec.ts               # 기준 HTML vs 앱 스크린샷 비교
docs/
  PLAN.md  DESIGN.md  reference/landing.html
```

---

## 4. 기준 명세

"똑같이"의 대상을 모두 적었습니다. 구현 중 애매하면 기준 HTML의 해당 줄을 봅니다.

### 4.1 화면 구조 (L78–L106)

```
canvas#gl            fixed 전체 화면, z 0, aria-hidden
nav                  fixed 상단, z 10, 위→아래 scrim→투명 그라데이션
  .in > .brand       "Lily"
main                 relative, z 1
  section#deploy     세로 flex, 가운데 정렬, 상단 여백 52vh
    .copy            h2 "지금 피워 보세요." + p 설명
    form             input(repo) + button "배포 시작"
    label.opt        checkbox "롤백 상황으로 시연하기"
    .err             role=alert
    #status          aria-live=polite, 처음엔 숨김
      ol#bars        6칸 진행바
      .now           현재 단계 | "n / 6"
      .done          결과 문구
      button#again   "다시 배포하기", 끝난 뒤에만 보임
```

### 4.2 스타일 매핑 (원본 CSS → Tailwind)

| 요소 | 원본 (줄) | Tailwind |
|---|---|---|
| nav | L25–26 | `fixed inset-x-0 top-0 z-10 pt-[env(safe-area-inset-top,0px)] bg-linear-to-b from-scrim to-transparent` |
| nav .in | L27 | `mx-auto flex max-w-page items-center justify-between px-6 py-4.5` |
| .brand | L28 | `text-brand font-semibold` |
| main | L30 | `relative z-1` |
| section | L31, L43 | `mx-auto flex min-h-screen max-w-page flex-col items-center px-6 pt-[52vh] pb-[6vh] text-center` |
| .copy | L32, L44 | `max-w-lg break-keep text-shadow-halo` |
| h2 | L33, L35 | `mb-[0.8rem] text-display font-semibold` |
| p | L36 | `text-lead text-mute` |
| form | L46, L71–72 | `mt-7 flex w-full max-w-lg gap-2 max-[641px]:flex-col` |
| input | L47–50 | `min-w-0 flex-1 rounded-xl border border-line bg-field px-4 py-3.5 text-input text-ink outline-none placeholder:text-mute focus-visible:border-ink` |
| button 공통 | L51–54 | `rounded-xl px-5 text-control font-semibold disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent` |
| └ primary | L51, L72 | `bg-ink text-surface max-[641px]:h-12` |
| └ ghost (#again) | L69 | `mt-3.5 h-10 border border-line bg-transparent text-ink` |
| .opt | L54–56 | `mt-3.5 inline-flex cursor-pointer items-center gap-2 text-caption text-mute focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent`, 체크박스 `accent-danger` |
| .err | L57 | `mt-2.5 min-h-[1.4em] text-caption text-danger` |
| #status | L59–60 | `mt-6 w-full max-w-lg text-left` (idle이면 렌더링 안 함) |
| ol | L61 | `grid gap-1.5` + `style={{ gridTemplateColumns: \`repeat(${segments}, 1fr)\` }}` (칸 수를 prop으로 받아 대시보드에서도 재사용) |
| li | L62 | `relative h-0.75 overflow-hidden rounded-xs bg-line` |
| li i (채움) | L63–64 | `absolute inset-0 bg-ink transition-[width] duration-300 ease-linear` + `style={{ width }}`, 실패 칸 `bg-rollback` |
| .now | L65–66 | `mt-3 flex justify-between gap-3 text-control`, 카운터 `whitespace-nowrap text-mute` |
| .done | L67–68 | `mt-3.5 text-note text-mute`, 링크 `text-ink underline` |
| 등장 효과 | L39–41, L74 | 자식마다 `opacity-0 translate-y-3 transition-[opacity,translate] duration-1000 ease-standard`, 등장 후 `opacity-100 translate-y-0`. `.err`는 이동 없음. `motion-reduce:transition-none` |

**원본과 달라지기 쉬운 곳**
- **breakpoint 경계**: 원본은 `max-width: 640px`(640 포함)이고, Tailwind의 `max-sm`은 `< 640px`입니다. 그래서 `max-[641px]`을 씁니다.
- **translate 속성**: Tailwind v4의 `translate-y-*`는 `transform`이 아니라 `translate` 속성을 씁니다. 전환 대상에 `translate`를 넣어야 움직임이 보입니다.
- **preflight 기본값**: Tailwind v4 preflight가 원본과 다르게 초기화하는 것들이 있습니다.
  - `line-height: 1.5` → base에서 `normal`
  - 버튼 커서 `default` → base에서 `pointer`
  - 플레이스홀더 50% 색 → `placeholder:text-mute`
  - 링크 `color: inherit`, 밑줄 제거 → 결과 문구 링크에 `text-ink underline`
- **폼 높이**: 폼은 세로 flex의 자식이라 버튼 높이가 입력 높이에 맞춰 늘어납니다(원본과 같음). 모바일에서만 `h-12`로 고정합니다.

### 4.3 상호작용과 배포 시뮬레이션 (L313–L371)

**히어로 등장**
- 페이지 진입(`performance.now()` = 0) 후 1400ms에 섹션 자식들이 한꺼번에 나타납니다. 이미 1400ms가 지났으면 즉시 나타납니다.
- reduced motion이면 즉시 나타나고 전환도 없습니다.

**제출 검증** (L322–L334)
- **정규식**: `^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$`
  - 입력은 먼저 앞뒤 공백을 지우고, 끝의 `.git`과 `/`를 제거합니다.
  - 결과는 `owner/repo`입니다.
- **실패하면**
  - 오류 문구 `owner/repo 형식이나 github.com 주소로 입력해 주세요.`를 띄우고 입력창으로 포커스를 옮깁니다.
  - 오류 문구는 입력을 고칠 때가 아니라 다음에 **유효한 값을 제출할 때** 지워집니다.
- **진행 중 중복 제출**은 무시합니다.

**배포 단계**

| # | 이름 | 시간(s) | 누적(s) |
|---|---|---|---|
| 1 | 레포 확인 중 | 1.2 | 1.2 |
| 2 | 빌드 중 | 3.2 | 4.4 |
| 3 | 이미지 올리는 중 | 1.6 | 6.0 |
| 4 | 트래픽 10%로 새 버전 내보내는 중 | 2.2 | 8.2 |
| 5 | 에러율·응답 시간 판정 중 | 2.6 | 10.8 |
| 6 | 트래픽 100%로 전환 중 | 1.6 | 12.4 |

- **단계 진행**
  - 단계마다 12번에 나눠 진행합니다. 한 번 기다리는 시간은 `시간/12`이고, reduced motion이면 `min(시간/12, 300ms)`입니다.
  - 매 스텝마다 칸 너비를 `s/12`로 채우고, 꽃 진행 목표를 `(i + s/12) / 6`으로 올립니다.
  - 단계가 시작될 때 현재 단계 줄을 `이름 | "i+1 / 6"`으로 바꿉니다.
- **시작할 때**
  - 입력과 버튼을 비활성화합니다.
  - 상태 영역을 보이고, 결과 문구를 비우고, "다시 배포하기"를 숨깁니다.
  - 모든 칸을 0%로 되돌리고 실패 표시를 지웁니다.
  - 체크박스는 비활성화하지 않습니다. 실패 여부는 시작하는 순간 값으로 고정됩니다.
- **성공하면**
  - 단계 줄: `배포 완료 | 6 / 6`
  - 결과 문구: `**{owner/repo}**가 피었어요. 주소는 [{slug}.lily.app]이고, 모니터링 화면에서 상태를 계속 볼 수 있어요.`
    - 링크는 누를 수 없습니다(`preventDefault`).
    - `slug`는 레포 이름을 소문자로 바꾸고 `[^a-z0-9-]`를 `-`로 바꾼 값입니다. 예: `next.js` → `next-js`
- **롤백 시연이면** 5단계 7번째 스텝(누적 9.717s)에서 멈춥니다.
  1. 5번째 칸이 `rollback` 색이 되고(7/12 채움), 꽃 시듦 목표가 1이 되며, 단계 줄이 `에러율 기준 초과`로 바뀝니다.
  2. 1400ms를 기다립니다(reduced motion이면 300ms).
  3. 시듦 목표가 0.85가 되고 단계 줄이 `이전 버전으로 되돌렸어요`로 바뀝니다. 카운터는 `5 / 6` 그대로입니다.
  4. 결과 문구: `새 버전의 에러율이 기준(2%)을 넘어서 트래픽을 이전 버전으로 모두 돌렸어요. 서비스는 계속 정상이에요. 로그에서 원인을 확인한 뒤 다시 배포해 주세요.`
  5. 꽃 진행 목표는 0.764에 그대로 머뭅니다.
- **끝나면** "다시 배포하기"만 보입니다. 입력과 버튼은 계속 비활성화 상태입니다.
- **다시 배포하기**
  - 진행·시듦 목표를 0으로 돌리고, 상태 영역과 "다시 배포하기"를 숨깁니다.
  - 입력과 버튼을 활성화하고 입력창으로 포커스를 옮깁니다.
  - 입력값과 체크박스는 유지됩니다.

### 4.4 꽃 씬 (L110–L310)

| 항목 | 값 | 줄 |
|---|---|---|
| renderer | `antialias:false, alpha:false, powerPreference:'high-performance'`, pixelRatio `min(dpr, 2)`, clear = surface | L113–117 |
| camera | Perspective fov 40, near 0.05, far 100 | L119 |
| uniforms | `uTime, uAssemble(reduce?1:0), uProgress, uWilt, uSize, uPR, uOpacity(1), uGather` | L122–125 |
| 셰이더 | vert L128–169, frag L170–177. **그대로 옮기되** gray·dry 색만 uniform으로 | |
| 파티클 | 마스크 밝기 ≥ 0.1 픽셀마다 `floor(b·K + rand)`개. `K = small ? 2.4 : 3.8`, `small = innerWidth < 700`(생성 시 1회만 판정), `W = 3.4`, 중심 `(88.2, 79.6)/187·S` | L179–223 |
| 파티클 속성 | position, aStart(반지름 5~11 구면, z −3), aSpread(1.06배 + 0.03~0.20 흩뿌림), aRand, aBright, aExtra(40%), aColor(d 기준 stamen→pollen→petal→petal-edge, 반점 3.5%) | L186–215 |
| 먼지 | `small ? 600 : 1400`개, x ±7, y ±4.5, z −2~−8, 밝기 0.12~0.37, 색 dust | L225–241 |
| 먼지 uniform | **꽃 uniform 객체를 얕은 복사**해서 `uProgress·uWilt=0`, `uAssemble=1`만 새로 만듭니다. `uTime·uSize·uPR·uGather`는 **꽃과 같은 객체를 공유**합니다. 그래서 배포가 진행되면 먼지도 밝아지고 커집니다. 이 동작을 유지합니다. | L238 |
| 인트로 | 마스크 로드 후 3200ms 동안 `uAssemble` 0→1 (선형) | L243–250 |
| 카메라 맞춤 | `FLOWER {cx .12, cy −.25, hw 1.65, hh 1.70}`, `FIT_MARGIN 1.0`, 위쪽 = `폭≥700 ? 12 : navBottom−8`, 아래쪽 = 섹션 콘텐츠 시작 − 16, 가로는 폭의 86%, 세로 반폭 최소 0.1 | L253–273 |
| 루프 | `dt = min(0.05, Δ)`, reduced motion이 아니면 `uTime += dt`, 카메라·마우스·진행·모임·시듦을 `damp`로 추적, 꽃 회전 `x = mouse.y·0.18`, `y = mouse.x·0.28` | L292–310 |
| 입력 | pointermove → `(clientX/innerWidth − .5, clientY/innerHeight − .5)` | L262–263 |
| resize | 캔버스 크기, aspect, `uSize = h/900·20 + 4`, 카메라 맞춤 다시 계산 | L283–290 |

### 4.5 이식할 때 조심할 것

- **StrictMode 이중 실행**: 개발 모드에서 effect가 두 번 돕니다. `dispose()`에서 아래를 모두 정리해야 WebGL 컨텍스트가 새지 않습니다.
  - rAF 취소, 리스너 해제
  - geometry·material dispose, `renderer.dispose()`, `forceContextLoss()`
  - 마스크 이미지 로드 중에 해제되면 콜백을 무시
- **React 렌더와 루프 분리**: 60fps 루프에서 React state를 바꾸지 않습니다. React는 목표값만 `scene.setTargets()`로 넘기고, 씬은 한 번만 만듭니다.
- **난수**: `Math.random`을 `rng` 인자로 주입할 수 있게 해서, 테스트에서 결과를 고정할 수 있게 합니다.
- **숨겨진 탭**: 탭이 백그라운드면 브라우저가 타이머를 늦추고(100ms가 약 400ms로 측정됨) rAF를 멈춥니다. 앱 버그가 아니므로 테스트는 fake timer나 reduced motion으로 돌립니다.

---

## 5. 설계

### 5.1 재사용 맵

원본 코드에서 반복되던 부분을 공통 모듈 하나로 모읍니다. 새 기능은 먼저 이 표에서 쓸 수 있는 게 있는지 찾습니다.

| 원본의 중복 | 공통 모듈 | 지금 쓰는 곳 | 나중에 쓸 곳 |
|---|---|---|---|
| `x += (t−x)·(1−pow(b,dt))` 5곳 (L296–307) | `damp()` | 카메라, 마우스, 진행, 모임, 시듦 | 대시보드 애니메이션 |
| `setAttribute` 7줄 × 꽃·먼지 (L216–222, L233–239) | `createParticleGeometry(attrs)` | 꽃, 먼지 | — |
| 같은 `ShaderMaterial` 생성 2번 (L223, L240) | `createParticleMaterial(uniforms, palette)` | 꽃, 먼지 | — |
| 색상 배열·GLSL 색 | `readColorToken()` + DESIGN 토큰 | 꽃 팔레트, clear color | 차트 등 캔버스 렌더링 |
| `reduce` 분기 여러 곳 | `usePrefersReducedMotion()` / `prefersReducedMotion()` | Reveal, 꽃, 배포 대기 | 전역 |
| `button` 스타일 + `#again` 덮어쓰기 | `<Button variant>` | 배포 시작, 다시 배포하기 | 대시보드 액션 |
| input 스타일 | `<TextField>` | 레포 입력 | 대시보드 검색·설정 |
| 진행바 DOM 생성 (L319–320) | `<SegmentedProgress>` | 배포 단계 | 대시보드 배포 이력·상세 |
| 단계 줄 + 결과 문구 + 다시 배포 | `<DeployStatus>` | 랜딩 | 대시보드의 진행 중 배포 카드 |
| `parseRepo`, slug 계산 (L322, L367) | `parseRepo()`, `toSlug()` | 폼 검증, 결과 주소 | 프로젝트 추가 |
| `$('go').disabled` 등 수동 토글 | `deployReducer` 상태에서 계산 | 폼·상태 전체 | 대시보드 상태 표시 |
| 내비 | `<SiteNav>` (오른쪽 slot) | 랜딩 | 대시보드 헤더 |

**규칙**
- `components/ui`는 도메인 문구나 배포 개념을 모릅니다(props로만 받음).
- `components/deploy`는 랜딩에 종속되지 않습니다. 레이아웃·여백은 바깥에서 `className`으로 줍니다.

### 5.2 배포 도메인

시뮬레이션과 나중의 실제 API가 **같은 이벤트 형식**을 쓰도록 설계합니다. 대시보드도 같은 이벤트를 구독하면 됩니다.

```ts
// lib/deploy/types.ts
type RepoRef = { owner: string; name: string; full: string } // full = "owner/name"

type DeployEvent =
  | { type: 'stage-start'; stage: number }
  | { type: 'progress'; stage: number; fraction: number }   // fraction = s/12
  | { type: 'threshold-exceeded'; stage: number }            // 롤백 1단계: 시듦 1
  | { type: 'rolled-back' }                                 // 롤백 2단계: 시듦 0.85
  | { type: 'succeeded'; url: string }

type DeployStatus = 'idle' | 'running' | 'failing' | 'rolled_back' | 'succeeded'

type DeployState = {
  status: DeployStatus
  repo: RepoRef | null
  stage: number              // 0~5
  fractions: number[]        // 칸별 0~1
  failedStage: number | null
  result: DeployResult | null
}

type DeployResult = {
  repo: RepoRef; slug: string; url: string
  outcome: 'succeeded' | 'rolled_back'; finishedAt: number
}

// 드라이버: 시뮬레이션이든 실제 API든 같은 모양
type DeployDriver = (
  repo: RepoRef,
  opts: { simulateFailure: boolean; reducedMotion: boolean; signal: AbortSignal },
) => AsyncIterable<DeployEvent>
```

- **`deployReducer(state, event)`**: 순수 함수입니다. 테스트하기 쉽고, 대시보드가 이벤트 로그를 재생해 상태를 복원할 때도 씁니다.
- **`selectFlowerTargets(state)`**: 꽃 목표값을 한 곳에서 계산합니다.

  | 상태 | 꽃 목표값 |
  |---|---|
  | idle | `{progress: 0, wilt: 0}` |
  | running | `{progress: (stage + fraction) / 6, wilt: 0}` |
  | failing | 진행은 그대로, `wilt: 1` |
  | rolled_back | 진행은 그대로, `wilt: 0.85` |
  | succeeded | `{progress: 1, wilt: 0}` |

- **`useDeploy({ driver = simulateDeploy, onComplete })`**: `start(repo, { simulateFailure })`, `reset()`을 제공합니다. 언마운트되거나 reset하면 `AbortController`로 진행 중인 드라이버를 멈춥니다.
- **단계 줄 문구**도 상태에서 계산합니다.
  - failing → `에러율 기준 초과`
  - rolled_back → `이전 버전으로 되돌렸어요`
  - succeeded → `배포 완료`
  - 그 외 → 단계 이름

### 5.3 꽃 씬과 React 연결

```ts
// lib/three/flower/FlowerScene.ts
class FlowerScene {
  constructor(canvas: HTMLCanvasElement, opts: {
    maskUrl: string                          // '/flower-mask.png'
    palette: FlowerPalette                   // readColorToken으로 읽은 값
    reducedMotion: boolean
    getSlot: () => { top: number; bottom: number } // 꽃이 들어갈 세로 구간(뷰포트 px)
    rng?: () => number
  })
  setTargets(t: Partial<{ progress: number; wilt: number }>): void
  dispose(): void
}
```

- **`getSlot`으로 레이아웃 주입**: 원본 `fitView`는 `nav`와 `#deploy`를 직접 조회했습니다(L256–L273). 여기서는 페이지가 slot을 계산해 넘깁니다. 그래서 씬은 DOM 구조를 모르고, 대시보드에서 작은 꽃을 다른 위치에 그릴 때도 그대로 쓸 수 있습니다.
- **`FlowerCanvas` props**: `{ progress, wilt, getSlot }`. 씬 생성은 마운트 때 한 번뿐이고, props가 바뀌면 `setTargets`만 호출합니다.
- **`LandingPage`의 역할**: `useDeploy` 상태를 `selectFlowerTargets`로 바꿔 `FlowerCanvas`에 넘깁니다. 내비와 섹션은 ref로 재서 `getSlot`을 만듭니다.

### 5.4 대시보드 연결 지점 (만들지 않음)

- **완료 콜백**: `DeploySection`에 `onComplete(result: DeployResult)`를 열어 둡니다. 지금 랜딩에서는 아무것도 하지 않습니다(원본과 동일).
  - 대시보드가 생기면 이 콜백에서 이동합니다(예: `router.push(\`/dashboard/${result.slug}\`)`).
  - "대시보드로 이동" 버튼이 필요하면 `DeployStatus`의 액션 slot에 `<Button variant="ghost">`를 하나 더 넣습니다.
- **라우트 구조**: 랜딩은 `app/page.tsx`에 둡니다. 대시보드는 나중에 `app/(dashboard)/...` 라우트 그룹과 자체 layout으로 추가합니다. 루트 layout에는 폰트와 토큰만 둡니다.
- **미리 만들지 않는 것**: 라우트 상수, 빈 페이지, 사용하지 않는 토큰. 쓰지 않는 코드는 넣지 않습니다.
- **대시보드가 재사용할 것**
  - `DeployResult`, `DeployEvent`, `deployReducer`, `stages.ts`
  - `SegmentedProgress`, `DeployStatus`, `Button`, `TextField`, `SiteNav`
  - `FlowerScene`(선택: 프로젝트 건강 상태를 시듦 정도로 표현)

---

## 6. 태스크

각 태스크의 **완료 기준**은 PR을 머지해도 되는 조건입니다. 커밋은 제안이며, 한 커밋 안에서도 빌드가 깨지지 않게 유지합니다.

### T0. 계획·규칙 문서
- **산출물**: `docs/PLAN.md`, `docs/DESIGN.md`, `docs/reference/landing.html`
- **완료 기준**: 팀이 문서를 검토하고 결정 사항(§2)에 동의
- **커밋**: `docs: 랜딩 구현 계획·디자인 규칙·기준 화면 추가`

### T1. 프로젝트 스캐폴딩

- **상태**: 완료 (2026-10-01). Next.js 16.3.7 · React 19.3.0 · Tailwind 4.3.3 · pnpm 12.8.1. `build`, `lint`, `typecheck`, `test` 통과.
- **작업**
  - `create-next-app`(TypeScript, ESLint, Tailwind, App Router, `src/`, `@/*` 별칭)으로 생성합니다. `docs/`는 create-next-app 허용 목록에 있어 그대로 두고 생성할 수 있습니다.
  - `package.json`: `packageManager`에 pnpm을 지정하고, `engines.node >= 24`를 적습니다.
  - scripts: `dev`, `build`, `lint`, `typecheck`(`tsc --noEmit`), `test`(vitest)
  - Vitest + jsdom + Testing Library를 설정하고 샘플 테스트를 하나 넣습니다.
  - create-next-app 샘플 페이지·SVG를 지우고, `page.tsx`는 빈 `<main />`만 남깁니다.
- **완료 기준**: `pnpm build && pnpm lint && pnpm typecheck && pnpm test` 통과. `/`에 샘플 콘텐츠가 없습니다.
- **커밋**
  1. `chore: Next.js 16 + Tailwind v4 프로젝트 초기화`
  2. `chore: Vitest·Testing Library 설정`

### T2. 디자인 토큰·폰트·기본 스타일

- **진행**: 구현 및 build·lint·typecheck·test 통과. 폰트 실 렌더링과 토큰 유틸리티는 T3 화면 비교에서 추가 확인.
- **작업**
  - `globals.css`를 아래 초안으로 작성합니다. 값은 DESIGN.md 표와 같습니다.
  - `layout.tsx`
    - `<html lang="ko" className={plex.variable}>`, `metadata.title = 'Lily — 레포 하나로 피는 배포'`
    - `viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }`. 원본에 theme-color가 없으므로 넣지 않습니다.
  - `scripts/check-design-tokens.mjs`
    - `src/**/*.{ts,tsx,css}` 중 `src/app/globals.css`만 빼고 검사합니다.
    - 잡는 패턴: hex 색, `rgb(a)/hsl/oklch/color-mix(`, Tailwind 임의 색상 `-[#`·`-[rgb`, GLSL `vec3(<숫자>, <숫자>, <숫자>)`
    - `lint` 스크립트에 연결합니다.

```css
@import "tailwindcss";

@theme {
  --color-*: initial;
  --color-surface: #000000;
  --color-ink: #F2F0EC;
  --color-mute: #8C8B88;
  --color-accent: #E0567E;
  --color-danger: #D6453D;
  --color-rollback: #8C7560;
  --color-warning: #E9A53A;

  --container-page: 1080px;

  --text-display: clamp(1.8rem, 4vw, 2.75rem);
  --text-display--line-height: 1.15;
  --text-display--letter-spacing: -0.025em;
  --text-lead: 1.0625rem;
  --text-lead--line-height: 1.7;
  --text-brand: 1.25rem;
  --text-brand--line-height: normal;
  --text-brand--letter-spacing: -0.01em;
  --text-input: 1rem;
  --text-input--line-height: normal;
  --text-control: 0.95rem;
  --text-control--line-height: normal;
  --text-note: 0.95rem;
  --text-note--line-height: 1.6;
  --text-caption: 0.875rem;
  --text-caption--line-height: normal;

  --ease-standard: ease;
}

@theme inline {
  --font-sans: var(--font-plex-sans-kr), "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
  --color-line: color-mix(in srgb, var(--color-ink) 18%, transparent);
  --color-field: color-mix(in srgb, var(--color-ink) 6%, transparent);
  --color-scrim: color-mix(in srgb, var(--color-surface) 75%, transparent);
  --text-shadow-halo: 0 0 28px var(--color-surface), 0 0 10px var(--color-surface), 0 0 2px var(--color-surface);
}

/* 꽃(WebGL) 팔레트: JS가 readColorToken으로 읽음. Tailwind 출력 대상이 아니므로 @theme 밖에 둠 */
:root {
  --flower-stamen: rgb(72% 82% 45%);
  --flower-pollen: rgb(93% 66% 24%);
  --flower-petal: rgb(90% 33% 50%);
  --flower-petal-edge: rgb(100% 92% 94%);
  --flower-spot: rgb(62% 12% 28%);
  --flower-unlit: rgb(95% 94% 92%);
  --flower-wilt: rgb(56% 47% 37%);
  --flower-dust: rgb(100% 100% 100%);

  color-scheme: dark;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

@layer base {
  html { background: var(--color-surface); scroll-padding-top: env(safe-area-inset-top, 0px); }
  body {
    background: var(--color-surface);
    color: var(--color-ink);
    line-height: normal;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  button:not(:disabled) { cursor: pointer; }
}
```

- **완료 기준**
  - `bg-surface text-ink text-display text-shadow-halo`가 동작합니다. 빌드된 CSS에 `--color-ink`가 출력되는지도 확인합니다(`line`·`field`가 참조함).
  - 검사 스크립트가 샘플 위반(`bg-[#fff]`, `vec3(0.1, 0.2, 0.3)`)을 실패로 잡습니다.
  - DevTools > Rendered Fonts에서 한글이 **IBM Plex Sans KR**로 렌더링됩니다.
- **커밋**
  1. `feat: 디자인 토큰과 기본 스타일 추가 (globals.css)`
  2. `feat: IBM Plex Sans KR 폰트와 루트 레이아웃 설정`
  3. `chore: 색상 하드코딩 검사 스크립트를 lint에 연결`

### T3. UI 프리미티브·정적 레이아웃

- **상태**: 완료. build·lint·typecheck·test 통과, 두 뷰포트의 초기 DOM 픽셀 차이 0. 한글 IBM Plex 렌더링 확인으로 T2 추가 검증 완료.
- **작업**
  - `Button`(primary·ghost), `TextField`, `OptionCheckbox`, `SegmentedProgress`(`segments`, `fractions`, `failedIndex`), `SiteNav`, `Reveal`(지연값은 `lib/motion.ts`)
  - `usePrefersReducedMotion`
  - `DeployForm`·`DeployStatus`는 **표현만** 합니다. 모든 상태를 props로 받고, 스타일은 §4.2 매핑을 그대로 따릅니다.
  - `app/page.tsx`에서 정적으로 조립합니다. 아직 캔버스는 없고 배경은 검은색입니다.
  - Playwright 동등성 하네스(`e2e/parity.spec.ts`)의 뼈대: 기준 HTML과 앱을 같은 뷰포트에서 캡처합니다(캔버스는 mask). 상태별 비교는 T5부터 붙입니다.
- **완료 기준**: 1440×900과 390×844에서 초기 화면이 기준 HTML과 픽셀 비교 임계값 이내입니다. 기준 쪽은 reduced motion으로 즉시 표시하고 캔버스는 mask합니다.
- **커밋**
  1. `feat: Button·TextField·OptionCheckbox·SegmentedProgress 추가`
  2. `feat: SiteNav·Reveal·usePrefersReducedMotion 추가`
  3. `feat: 랜딩 정적 레이아웃 조립`
  4. `test: 기준 화면 스크린샷 비교 하네스 추가`

### T4. 도메인 로직
- **작업**
  - `parseRepo`, `toSlug`
  - `types.ts`, `stages.ts`, `simulateDeploy`(AbortSignal 지원, reduced motion이면 대기 최대 300ms), `deployReducer`, `selectFlowerTargets`, `useDeploy`
- **테스트**
  - **parseRepo**: 허용(`owner/repo`, `github.com/o/r`, `https://www.github.com/o/r.git/`)과 거부(`not a repo!!`, 빈 값, 40자 owner)
  - **toSlug**: `next.js` → `next-js`
  - **타임라인**(fake timer)
    - 성공은 12.4s에 `succeeded`
    - 실패는 9.717s에 `threshold-exceeded`, 11.117s에 `rolled-back`
    - 진행 목표 순서가 `(i + s/12) / 6`
  - **reduced motion**일 때 전체 시간이 줄어드는지
  - **abort**하면 이벤트가 멈추는지
- **완료 기준**: 위 테스트 통과, UI 의존성 없음
- **커밋**
  1. `feat: 레포 주소 파싱·slug 변환`
  2. `feat: 배포 이벤트 타입·단계 정의·시뮬레이션 드라이버`
  3. `feat: 배포 리듀서와 useDeploy 훅`

### T5. 배포 인터랙션 연결
- **작업**
  - `LandingPage`(client)에서 `useDeploy`와 `DeployForm`·`DeployStatus`를 연결합니다. §4.3 동작을 그대로 구현합니다.
    - 검증 오류와 포커스
    - 진행 중 비활성화
    - 단계 줄·카운터·결과 문구
    - 다시 배포하기와 포커스
    - 체크박스는 활성 유지
  - `Reveal`로 1.4초 등장
  - `onComplete` 연결 지점을 열어 둡니다(§5.4, 지금은 아무것도 하지 않음).
- **테스트**
  - Testing Library: 잘못된 입력이면 오류와 포커스, 성공 흐름(fake timer), 롤백 흐름, 다시 배포하면 초기화와 포커스
  - Playwright 동등성: 오류 상태, 완료 상태, 롤백 상태를 기준 HTML과 비교합니다(reduced motion이라 빠르게 끝남).
- **완료 기준**: 테스트 통과, 수동 체크리스트(§7) 중 DOM 항목 통과
- **커밋**
  1. `feat: 배포 폼 검증과 상태 표시 연결`
  2. `feat: 히어로 등장 타이밍과 다시 배포하기`
  3. `test: 배포 흐름 컴포넌트·동등성 테스트`

### T6. 꽃 씬 순수 모듈
- **작업**
  - `scripts/extract-flower-mask.mjs`로 기준 HTML의 base64 PNG를 `public/flower-mask.png`에 저장합니다(187×187, 그레이스케일).
  - `readColorToken`: `#rrggbb`와 `rgb(% % %)`를 파싱하고 `THREE.Color`를 쓰지 않습니다.
  - `config.ts`: FLOWER 치수, FLOWER_MOTION, 파티클 상수
  - `shaders.ts`: 원본 L128–177을 옮기고, gray·dry를 `uUnlitColor`·`uWiltColor` uniform으로 바꿉니다.
  - `particles.ts`: `buildFlowerAttributes(mask, { rng, small, palette })`, `buildDustAttributes({ rng, small, palette })`. 순수 함수이고 typed array를 반환합니다.
  - `material.ts`: 공통 `createParticleGeometry`와 `createParticleMaterial`
  - `fitView.ts`: `fitView({ slot, viewport, fov }) → { cam, look }`
  - `damp.ts`
- **테스트**
  - `readColorToken`
  - 파티클: 고정 rng로 개수·범위·색 분기 스냅샷
  - `fitView`: 1456×804에서 꽃이 slot 안에 들어오고, 390×780에서는 가로 86% 이내
  - `damp`: dt=0이면 그대로, 수렴함
- **완료 기준**: 테스트 통과, 검사 스크립트 통과(색 리터럴 없음)
- **커밋**
  1. `chore: 기준 화면에서 꽃 마스크 에셋 추출`
  2. `feat: 색상 토큰 리더와 꽃 설정·셰이더`
  3. `feat: 꽃·먼지 파티클 빌더와 공통 머티리얼`
  4. `feat: 카메라 맞춤·감쇠 유틸`

### T7. 꽃 씬 런타임·캔버스
- **작업**
  - `FlowerScene`: renderer·camera, 마스크 로드, 인트로, 루프, 포인터, resize, `setTargets`, `dispose`. 먼지 uniform은 얕은 복사로 공유합니다(§4.4).
  - `FlowerCanvas`(dynamic, ssr:false)
  - 랜딩에 캔버스를 올리고 `getSlot`을 연결합니다.
- **완료 기준**
  - 기준과 나란히 띄웠을 때 인트로(3.2s 모임), 크기와 위치, 마우스 기울임이 같습니다.
  - 창 크기를 바꾸면 카메라가 부드럽게 다시 맞춰집니다.
  - 개발 모드에서 10번 다시 마운트해도 "Too many active WebGL contexts" 경고가 없습니다.
  - reduced motion이면 처음부터 완성된 정지 상태입니다.
- **커밋**
  1. `feat: FlowerScene 렌더 루프와 인트로`
  2. `feat: 포인터·리사이즈·카메라 맞춤 연결과 dispose`
  3. `feat: FlowerCanvas를 랜딩에 배치`

### T8. 꽃↔배포 연결
- **작업**: `selectFlowerTargets`의 결과를 `FlowerCanvas`로 넘깁니다. 성공, 롤백(1 → 0.85), 다시 배포하기(0) 흐름을 확인합니다.
- **완료 기준**
  - 기준과 나란히 띄웠을 때 색이 중심부터 번지는 속도와 모양이 같습니다.
  - 롤백 시 갈색으로 시들고 꽃가루가 떨어지며, 다시 배포하면 회복됩니다.
  - 배포가 진행되면 먼지도 함께 밝아집니다.
  - 배포 진행 중 React 리렌더가 있어도 씬이 다시 만들어지지 않습니다.
- **커밋**: `feat: 배포 진행에 따라 꽃 색 번짐·시듦 연결`

### T9. 동등성 QA·마감
- **작업**
  - §7 전체 검증
  - 모바일 실기기(iOS Safari safe-area, 가로 모드)
  - 성능: 데스크톱 60fps, 모바일 파티클 수 확인
  - Lighthouse 접근성
  - README(실행 방법, 문서 링크)
- **완료 기준**: §7 체크리스트 전부 통과. 차이가 있으면 문서화하고 합의합니다.
- **커밋**: `test: 동등성 테스트 보강`, `docs: README 정리`

---

## 7. 검증 전략

1. **단위·컴포넌트 (Vitest)**: 순수 함수(parseRepo, toSlug, reducer, fitView, particles, readColorToken)와 배포 흐름(fake timer)
2. **DOM 동등성 (Playwright)**
   - 조건: 기준 HTML과 앱을 같은 뷰포트(1440×900, 390×844)에서, `reducedMotion: 'reduce'`로, 캔버스를 mask하고 캡처해 비교합니다.
   - 상태: 초기 / 입력 오류 / 성공 완료 / 롤백 완료
   - 기준 HTML도 CDN 폰트(Plex KR)를 쓰므로 글꼴 조건이 같습니다.
3. **꽃 연출 체크리스트 (수동, 나란히 비교)**
   - [ ] 인트로: 흩어진 입자가 3.2초에 걸쳐 모이고, 폼은 1.4초에 나타남
   - [ ] 크기·위치: 1440×900, 390×844에서 잘림 없이 기준과 같음
   - [ ] 마우스 기울임 방향과 정도
   - [ ] 진행: 중심에서 바깥으로 번지는 색(stamen → pollen → petal → edge), 반점
   - [ ] 먼지가 배포 진행에 따라 밝아짐
   - [ ] 롤백: 갈색으로 시들고 처짐, 꽃가루 낙하, 0.85로 약간 회복
   - [ ] 다시 배포: 색·시듦이 부드럽게 초기화
   - [ ] reduced motion: 정지 상태, 전환 없음
4. **백그라운드 탭 주의**: 자동화 탭이 백그라운드면 타이머가 늦어집니다. 시간 검증은 fake timer로 하고, 수동 확인은 탭을 앞에 띄운 채로 합니다.

---

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| three 번들이 초기 로드를 늦춤 | `dynamic(ssr:false)`로 분리. 폼 등장은 three와 무관(1.4초) |
| 한글 폰트가 fallback으로 렌더링 | T2 완료 기준에서 Rendered Fonts 확인. 문제가 있으면 `preload: false`와 한글 subset 설정 재검토 |
| Tailwind preflight로 원본과 미세하게 다름 | §4.2 주의 목록, T3 픽셀 비교로 조기 발견 |
| 색 관리로 꽃 색이 어긋남 | `THREE.Color` 금지, `readColorToken` 단일 경로 (DESIGN.md §2.2) |
| StrictMode에서 WebGL 컨텍스트 누수 | `dispose` 체크리스트(§4.5), T7 완료 기준의 재마운트 테스트 |
| 모바일 주소창 때문에 `vh`가 흔들림 | 원본과 같이 `vh`를 유지(동등성 우선). 개선(`svh`)은 별도 태스크로 논의 |
