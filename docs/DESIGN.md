# Lily 디자인 규칙

색·타이포·모션 값의 **단일 원천은 `src/app/globals.css`** 입니다. 이 문서는 그 값들의 의미와 사용 규칙을 설명합니다.
토큰을 추가하거나 바꿀 때는 `globals.css`와 이 문서의 표를 **같은 커밋**에서 함께 고칩니다.

기준 화면: [`docs/reference/landing.html`](./reference/landing.html) (Artifact v9)

---

## 1. 절대 규칙

1. **색상 리터럴 금지** — `src/app/globals.css`를 제외한 모든 코드(컴포넌트, 훅, three.js, GLSL)에서 아래를 쓰지 않습니다.
   - `#fff`, `#F2F0EC` 같은 hex
   - `rgb()`, `rgba()`, `hsl()`, `oklch()`, `color-mix()`
   - Tailwind 임의 색상: `bg-[#000]`, `text-[rgb(...)]`
   - GLSL 색상 리터럴: `vec3(0.95, 0.94, 0.92)`
   - JS 색상 배열: `[0.93, 0.66, 0.24]`
2. **색은 토큰으로만** — Tailwind 유틸리티(`bg-surface`, `text-ink` …)나 `var(--…)`로 씁니다. three.js는 `readColorToken()`으로 읽어서 uniform·attribute로 넘깁니다(§2.2).
3. **투명도는 의미 토큰으로** — 즉석 `/NN` 수정자(`border-ink/18`) 대신 `border-line`처럼 이름 붙은 토큰을 씁니다. 새 투명도가 필요하면 토큰을 추가합니다.
4. **Tailwind 기본 팔레트 비활성화** — `@theme { --color-*: initial; }`. `bg-red-500`, `text-white` 같은 클래스는 아예 생성되지 않습니다.
5. **자동 검사** — `pnpm lint`가 `scripts/check-design-tokens.mjs`를 실행해 1번 위반을 실패로 처리합니다.

## 2. 색상 토큰

### 2.1 UI 토큰 (`@theme`, Tailwind 유틸리티로 사용)

| 토큰 | 값 | 유틸리티 예 | 쓰임 | 원본 이름 |
|---|---|---|---|---|
| `--color-surface` | `#000000` | `bg-surface` `text-surface` | 페이지 배경, 주 버튼 글자, 글자 헤일로, WebGL clear color | `--bg` |
| `--color-ink` | `#F2F0EC` | `text-ink` `bg-ink` `border-ink` | 강조 글자, 주 버튼 배경, 진행바 채움, 입력 포커스 테두리, 링크 | `--ink` |
| `--color-mute` | `#8C8B88` | `text-mute` `placeholder:text-mute` | 보조 글자, 플레이스홀더, 단계 카운터 | `--mute` |
| `--color-line` | ink 18% | `border-line` `bg-line` | 입력·보조 버튼 테두리, 빈 진행바 | `--line` |
| `--color-field` | ink 6% | `bg-field` | 입력창 배경 | `--field` |
| `--color-scrim` | surface 75% | `from-scrim` | 상단 내비 그라데이션 시작색 | 하드코딩 `rgba(0,0,0,.75)` |
| `--color-accent` | `#E0567E` | `outline-accent` | 포커스 링 | `--pink` |
| `--color-danger` | `#D6453D` | `text-danger` `accent-danger` | 입력 오류 문구, 롤백 체크박스 | `--danger` |
| `--color-rollback` | `#8C7560` | `bg-rollback` | 실패한 단계의 진행바 채움 | 하드코딩 |
| `--color-warning` | `#E9A53A` | `text-warning` | 원본에 정의만 있고 쓰이지 않음. 대시보드 경고 상태용으로 예약 | `--amber` |

- `line`, `field`, `scrim`은 `color-mix(in srgb, var(--color-ink) 18%, transparent)`처럼 다른 토큰에서 파생합니다. 원본의 `rgba(242,240,236,.18)`와 같은 값이지만 ink 값을 두 번 적지 않습니다.
- 이 서비스는 **항상 어두운 화면**입니다(`color-scheme: dark`). 라이트 테마는 없습니다.

### 2.2 꽃(WebGL) 팔레트 (일반 `:root` 블록, JS가 런타임에 읽음)

- **위치**: Tailwind v4는 CSS에서 실제로 쓰인 테마 변수만 출력합니다. 이 값들은 CSS에서 쓰지 않고 JS만 읽으므로, `@theme`이 아니라 일반 `:root`에 둡니다.
- **표기**: 원본은 0~1 실수로 셰이더·JS에 직접 박혀 있었습니다. `rgb(%)` 표기로 쓰면 그 실수를 손실 없이 옮길 수 있습니다(93% = 0.93).

| 토큰 | 값 | 원본 위치 | 쓰임 |
|---|---|---|---|
| `--flower-stamen` | `rgb(72% 82% 45%)` | JS `green` | 꽃 중심 (d < 0.07) |
| `--flower-pollen` | `rgb(93% 66% 24%)` | JS `amber` | 수술 링 (d < 0.16) |
| `--flower-petal` | `rgb(90% 33% 50%)` | JS `pink` | 꽃잎 안쪽 |
| `--flower-petal-edge` | `rgb(100% 92% 94%)` | JS `blush` | 꽃잎 바깥쪽 |
| `--flower-spot` | `rgb(62% 12% 28%)` | JS 반점 | 스타게이저 백합 반점 (입자 3.5%) |
| `--flower-unlit` | `rgb(95% 94% 92%)` | GLSL `gray` | 아직 색이 번지지 않은 입자 |
| `--flower-wilt` | `rgb(56% 47% 37%)` | GLSL `dry` | 시든 입자 |
| `--flower-dust` | `rgb(100% 100% 100%)` | JS 먼지 색 | 배경 먼지 |

**three.js에서 읽는 규칙**

- **`new THREE.Color(token)` 금지**: three 0.186은 ColorManagement가 기본으로 켜져 있어서 sRGB 문자열을 선형 공간으로 바꿉니다. 그러면 원본(r128, 변환 없음)보다 어둡고 탁해집니다.
- **`readColorToken()` 사용**: `src/lib/design/readColorToken.ts`가 `getComputedStyle(document.documentElement).getPropertyValue(name)`의 원문을 파싱해 변환 없는 `[r, g, b]`(0~1)를 돌려줍니다. 지원 표기는 `#rrggbb`와 `rgb(r% g% b%)`입니다.
- **빌드 최적화 대응**: `--flower-*-channels`에 퍼센트 세 채널을 저장하고 팔레트 토큰은 `rgb(var(--flower-*-channels))`로 조립합니다. CSS 최적화가 상수 색을 hex로 반올림하는 것을 막습니다. 토큰 리더는 최적화된 UI 토큰의 짧은 hex도 지원합니다.
- **퍼센트 보존**: `@property`로 등록하지 않은 커스텀 프로퍼티는 계산값이 원문 그대로라서 퍼센트가 보존됩니다.
- **셰이더 색도 uniform으로**: 원본 셰이더에 박혀 있던 gray·dry도 uniform(`uUnlitColor`, `uWiltColor`)으로 바꿔 토큰에서 넣습니다.

## 3. 타이포그래피

- **글꼴**: IBM Plex Sans KR. `next/font/google`로 불러오고 weight는 400·600만 씁니다. 원본은 300도 불러왔지만 실제로 쓰는 곳이 없어 뺐습니다.
- **폰트 스택**: `--font-sans: var(--font-plex-sans-kr), "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`
- **기본 line-height는 `normal`**: 원본은 브라우저 기본값을 썼습니다. Tailwind preflight가 설정하는 1.5를 base에서 덮어씁니다.

| 유틸리티 | 크기 | line-height | letter-spacing | 쓰임 |
|---|---|---|---|---|
| `text-display` | `clamp(1.8rem, 4vw, 2.75rem)` | 1.15 | -0.025em | "지금 피워 보세요." (`font-semibold`) |
| `text-lead` | 1.0625rem | 1.7 | — | 히어로 설명 |
| `text-brand` | 1.25rem | normal | -0.01em | 내비 "Lily" (`font-semibold`) |
| `text-input` | 1rem | normal | — | 입력창 |
| `text-control` | 0.95rem | normal | — | 버튼(`font-semibold`), 현재 단계 줄 |
| `text-note` | 0.95rem | 1.6 | — | 배포 결과 문구 |
| `text-caption` | 0.875rem | normal | — | 롤백 옵션, 오류 문구 |

- 히어로 문구에는 `break-keep`(`word-break: keep-all`)을 씁니다. 한국어가 어절 중간에서 줄바꿈되지 않게 합니다.
- 결과 문구의 레포 이름은 `font-semibold text-ink`로 표시합니다. 원본은 `<b>`(700)였지만 700 폰트 파일을 불러오지 않아서 실제로는 600으로 렌더링됐습니다.

## 4. 레이아웃·간격·모양

| 항목 | 값 | 유틸리티 |
|---|---|---|
| 페이지 최대 폭 | 1080px (`--container-page`) | `max-w-page` |
| 페이지 좌우 여백 | 24px | `px-6` |
| 폼·상태 영역 폭 | `min(32rem, 100%)` | `w-full max-w-lg` |
| 컨트롤 모서리 | 12px | `rounded-xl` |
| 진행바 모서리 | 2px | `rounded-xs` |
| 레이어 | 캔버스 0 / 본문 1 / 내비 10 | `z-0` / `z-1` / `z-10` |
| 글자 헤일로 | `0 0 28px, 0 0 10px, 0 0 2px` (모두 surface) | `text-shadow-halo` |

- 간격은 Tailwind 기본 4px 스케일로 원본 값을 옮깁니다. 매핑은 `PLAN.md` §4.2에 있습니다.
- 간격 같은 비색상 임의값(`pt-[52vh]`, `mb-[0.8rem]`)은 허용합니다. 금지 대상은 색상뿐입니다.

## 5. 모션

| 이름 | 값 | 정의 위치 |
|---|---|---|
| 히어로 등장 지연 | 페이지 진입 후 1400ms (`performance.now()` 기준) | `src/lib/motion.ts` |
| 히어로 페이드 | opacity + translateY(12px), 1s `ease` | CSS (`--ease-standard`) |
| 진행바 채움 | width 0.3s linear | CSS |
| 꽃 감쇠 계수 | 카메라 0.02, 마우스 0.05, 진행 0.15, 모임 0.35, 시듦 0.45 | `FLOWER_MOTION` |
| 꽃 인트로 | 3200ms 동안 입자 모임 | `FLOWER_MOTION` |

- **감쇠 공식**: `x ← x + (target − x)·(1 − base^dt)`. 매 프레임 남은 거리의 일정 비율만큼 목표에 다가갑니다. `damp()` 하나로 통일합니다.
- **`prefers-reduced-motion: reduce`일 때**
  - 히어로가 즉시 나타나고 전환 효과가 없습니다.
  - 꽃은 처음부터 완성된 상태로 보이고 시간이 흐르지 않습니다.
  - 배포 단계별 대기는 최대 300ms로 줄어듭니다.
- 모션 숫자는 색이 아니므로 TS 설정 객체에 둡니다. 단, 한 파일에만 둡니다.

## 6. 상호작용·접근성

- **포커스 링**: `button:focus-visible`과 체크박스 라벨의 `:focus-within`에 2px `accent`, offset 3px를 줍니다.
- **입력 포커스**: 테두리가 `ink`로 바뀝니다.
- **버튼 커서**: Tailwind v4 preflight는 버튼 커서를 `default`로 둡니다. base에서 `button:not(:disabled) { cursor: pointer }`로 되돌립니다.
- **비활성 버튼**: `opacity .4`, 커서 `default`.
- **플레이스홀더**: v4 preflight의 기본값은 글자색 50%입니다. 원본과 맞추려면 `placeholder:text-mute`를 지정합니다.
- **스크린리더**: 오류 영역은 `role="alert"`, 상태 영역은 `aria-live="polite"`, 입력 라벨은 `sr-only`입니다.

## 7. 토큰을 추가할 때 (대시보드 등)

1. 기존 의미 토큰으로 해결되는지 먼저 확인합니다. 재사용이 우선입니다.
2. 새 의미가 필요하면 `globals.css`에 **의미 이름**으로 추가합니다. 예: `--color-success`는 괜찮고 `--color-green`은 안 됩니다.
3. 같은 커밋에서 이 문서의 표도 갱신합니다.
