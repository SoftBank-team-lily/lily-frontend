# GitHub App으로 브랜치 푸시 자동 배포

상태: **기획**. 저장소 설정에 웹훅을 직접 넣는 경로는 프론트에 들어가 있다. 이 문서는 그 다음인 GitHub App 설치 경로다.

## 1. 목표

사용자가 릴리 GitHub App을 설치하고 저장소를 고르면, 프로젝트에 적힌 브랜치에 푸시가 올 때마다 다시 배포한다. 브랜치를 비우면 `main`이다. 사용자는 Payload URL과 Secret을 GitHub에 붙여 넣지 않는다.

배포가 시작되면 지금은 그대로다. 프론트가 `deployments`에 `queued` 행을 만들고, 실행기가 `lily-builder`로 빌드를 보내면 `lily-cicd` 또는 내 PC 에이전트가 띄운다.

## 2. 지금과 차이

| | 지금 (저장소 웹훅) | 목표 (GitHub App) |
|---|---|---|
| 사용자가 하는 일 | 계정 화면의 URL·Secret을 저장소 Settings → Webhooks에 넣음 | 앱 설치 화면에서 저장소를 고름 |
| 서명 시크릿 | 프로젝트마다 릴리가 만들어 화면에 보여 줌 | 앱에 하나. 서버 환경 변수에만 있음 |
| 푸시를 받는 주소 | `POST /api/github/webhook` | 같은 주소 |
| 그 다음 | 커밋 SHA로 배포 기록 | 같음 |

Vercel에서 메인 브랜치만 연결하면 바로 배포되는 것도 이 구조다. Vercel GitHub App이 푸시를 받고, 사용자는 웹훅 값을 복사하지 않는다. 릴리에 배포되게 하려면 Vercel 앱이 아니라 릴리 앱이 설치되어 있어야 한다.

## 3. 비용

GitHub App을 만들고 `push`를 받는 데는 GitHub 요금이 없다. 배포 한 건마다 GitHub에 내는 돈도 없다. 빌드와 배포 비용은 지금 클러스터·에이전트와 같다.

드는 것은 앱 등록, 설치 화면, 설치한 저장소와 프로젝트를 잇는 개발이다.

## 4. 사용자 흐름

1. 계정 화면에서 GitHub 연결을 누른다. 릴리에 로그인한 상태여야 한다.
2. GitHub 앱 설치 화면으로 간다. 계정 또는 조직과, 그 안의 저장소를 고른다.
3. GitHub가 설치 id와 `state`를 릴리 설정 URL로 돌려준다. `state`는 누른 사람의 릴리 계정과 맞아야 한다.
4. 릴리는 그 설치가 볼 수 있는 저장소를 조회하고, 이 계정의 프로젝트 `repo`와 겹치는 것에 설치 id를 붙인다.
5. 이후 그 저장소의 해당 브랜치에 푸시가 오면 배포 기록이 생긴다.
6. 설치에서 저장소를 빼거나 앱을 지우면 그 프로젝트의 자동 배포는 멈춘다. 이미 떠 있는 앱은 그대로 둔다.

프로젝트를 먼저 등록하고 나중에 앱을 설치해도 된다. 저장소 이름이 같으면 설치가 끝난 뒤 연결한다.

## 5. GitHub에 등록하는 앱

앱은 GitHub 계정 또는 조직에 하나 만든다. 사용자마다 앱을 만들지 않는다.

| 항목 | 값 |
|---|---|
| Webhook URL | `https://{BETTER_AUTH_URL 출처}/api/github/webhook` |
| Webhook secret | 서버만 아는 값. 환경 변수 `GITHUB_APP_WEBHOOK_SECRET` |
| Setup URL | 설치 직후 돌아올 프론트 주소. `state`를 그대로 돌려준다 |
| 설치할 수 있는 곳 | 아무 계정·조직 |
| 권한 | Repository metadata: Read. 이벤트는 Push, Installation, Installation repositories |
| 비공개 저장소 클론 | 이번 범위 밖. Contents: Read와 설치 토큰은 그 다음 |

Webhook URL은 바깥에서 HTTPS로 열려 있어야 한다. `localhost`에는 GitHub가 이벤트를 넣지 못한다.

서버에 둘 값:

| 환경 변수 | 용도 |
|---|---|
| `GITHUB_APP_ID` | 앱 id |
| `GITHUB_APP_SLUG` | 설치 주소 `https://github.com/apps/{slug}/installations/new` |
| `GITHUB_APP_PRIVATE_KEY` | 앱 PEM. 설치 목록을 조회할 때 JWT로 쓴다 |
| `GITHUB_APP_WEBHOOK_SECRET` | 웹훅 서명. 화면에 보여 주지 않는다 |

개인 키와 웹훅 시크릿은 DB와 브라우저에 넣지 않는다.

## 6. 만들 것

프론트만 고친다. `lily-builder`, `lily-cicd`, `lily-on-premise`는 배포 기록이 생기면 지금 경로로 돈다.

1. **설치 시작.** 로그인한 사용자에게 짧은 `state`를 발급하고 GitHub 설치 URL로 보낸다.
2. **설치 완료.** Setup URL에서 `installation_id`와 `state`를 받는다. 세션의 사용자와 `state`가 같으면 `github_installations`에 계정과 설치 id를 저장한다. 앱 JWT로 설치 토큰을 받아 저장소 목록을 조회하고, 본인 프로젝트의 `repo`와 같으면 그 프로젝트에 설치 id를 붙인다.
3. **푸시 수신.** 지금 `POST /api/github/webhook`을 확장한다. 본문에 `installation.id`가 있으면 앱 시크릿으로 서명을 확인한다. 그 설치에 연결된 본인 프로젝트 가운데 브랜치가 맞는 것만 `createDeployment`한다. `request_key`는 지금처럼 커밋 SHA다.
4. **설치 변경.** `installation`, `installation_repositories` 이벤트로 저장소가 빠지거나 설치가 지워지면 연결을 끊는다.
5. **계정 화면.** 앱이 연결된 프로젝트는 URL·Secret 복사 대신 “푸시하면 배포됨”을 보여 준다. 연결 전이면 설치 버튼을 보여 준다.

서명 확인, 브랜치 비교(`branch`가 비어 있으면 `main`), 태그·삭제 푸시 무시, 커밋 SHA 한 번만 기록은 `src/lib/github/webhook.ts`에 있는 규칙을 그대로 쓴다.

## 7. 데이터

```text
github_installations
  installation_id  bigint  PRIMARY KEY
  owner_id         text    REFERENCES "user"(id)
  account_login    text
  created_at

projects.github_installation_id  bigint NULL
```

한 설치는 릴리 계정 하나에만 붙인다. 프로젝트는 그 계정의 설치에만 연결한다. 푸시는 `installation.id`와 `repository.full_name`(소문자)이 둘 다 맞는 프로젝트만 배포한다. 저장소 주소만 같고 앱을 설치하지 않은 다른 계정은 배포하지 않는다.

같은 계정이 한 저장소를 폴더만 다르게 여러 프로젝트로 등록했다면, 푸시 한 번이 그 폴더 프로젝트를 모두 배포한다. 저장소 웹훅에서는 시크릿이 프로젝트마다 달라 웹훅을 하나씩 넣어야 했다.

## 8. 배포가 생기는 조건

- 이벤트는 `push`다. `ping`은 200만 반환한다.
- `ref`는 `refs/heads/{브랜치}`다. 태그는 무시한다.
- 브랜치 삭제(`deleted`, `after`가 0)는 무시한다.
- 프로젝트 `branch`가 비어 있으면 `main`만 받는다. 다른 브랜치를 쓰려면 프로젝트에 브랜치를 적는다.
- 이미 그 커밋으로 배포 기록이 있으면 새로 만들지 않는다. GitHub가 같은 배달을 다시 보내도 한 건이다.
- 배포가 진행 중이어도 새 커밋은 기록을 추가한다. 실행기 동시 실행 한도는 지금 `BUILDER_MAX_ACTIVE`를 따른다.

## 9. 보안

- 앱 웹훅은 `X-Hub-Signature-256`을 앱 시크릿과 `timingSafeEqual`로 비교한다. 설치 id가 있는 요청을 프로젝트 시크릿으로 통과시키지 않는다.
- `state`는 일회용이고, 로그인한 사용자와 다를 때 설치를 저장하지 않는다.
- 설치 id만 알고 있는 다른 릴리 계정에는 프로젝트를 붙이지 않는다.
- 앱이 요청하는 권한은 메타데이터 읽기와 푸시 수신까지다. 저장소 내용을 앱 권한으로 읽는 일은 비공개 저장소 단계에서 따로 정한다.

## 10. 범위 밖

- 비공개 저장소 클론. 지금은 `lily-builder`가 Personal Access Token을 받을 때만 비공개 저장소를 빌드한다. 앱 설치 토큰으로 그 토큰을 대체하는 일은 다음이다.
- PR 미리보기, 브랜치마다 다른 주소, 배포 승인.
- 팀 단위로 설치를 공유하는 권한. 설치는 설치를 누른 릴리 계정에 둔다.
- Vercel 앱이나 다른 서비스의 앱으로 릴리 배포를 대신하는 일.

## 11. 저장소 웹훅과의 관계

앱이 연결되지 않은 프로젝트는 지금 화면(URL·Secret을 저장소 웹훅에 넣는 경로)을 유지한다. 앱이 연결된 프로젝트는 앱 이벤트만 배포로 인정한다. 두 경로가 같은 커밋을 동시에 받아도 배포 기록은 커밋 SHA 기준으로 하나다.

## 12. 순서

1. GitHub에 앱을 등록하고 위 환경 변수를 넣는다. 공개 HTTPS가 없으면 여기서 멈춘다.
2. 설치 시작·완료와 `github_installations`를 만들어, 계정 화면에서 저장소가 연결되는지만 확인한다.
3. 푸시 이벤트에 설치 id 분기를 넣어, 연결된 프로젝트만 배포 기록이 생기는지 확인한다.
4. 계정 화면에서 연결된 프로젝트의 수동 웹훅 안내를 가린다.
5. 비공개 저장소는 설치 토큰을 `lily-builder`에 넘기는 작업으로 따로 연다.
