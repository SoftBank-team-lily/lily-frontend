# 저장소 통합 및 테스트 결과

확인일: 2026-10-04. 대상: SoftBank-team-lily 조직의 17개 저장소.

## 병합

로컬 브랜치와 origin의 모든 브랜치를 main과 비교했다. 확인한 모든 브랜치의 커밋이 main에 포함되어 있으며, 작업물이 남아 있던 브랜치를 병합하고 원격 main으로 push했다. 기존 브랜치는 삭제하지 않았다.

| 저장소 | 이번 통합 내용 |
| --- | --- |
| lily-frontend | AI 수정 진행 표시, GitHub App·웹훅, 이메일 인증 해제 옵션, 최신 클라우드 이전·하이브리드 상태 기능 |
| lily-builder | JEV 진단 API, renewal_design UI, 팀의 최신 main 변경 |
| lily-observer | 진단 근거 수집·캐시·동시 요청 병합 및 설계 문서 |
| lily-cicd | HTTP 트래픽 라우터와 기존 pgroll·Ingress 기능 통합 |
| lily-monitoring-dashboard | 이미 병합된 기능 확인 및 로컬 계획 문서 보존 |
| .github | 공용 Java CI 및 이미지 빌드·push 워크플로 |

나머지 11개 저장소는 이미 모든 브랜치 작업이 main에 포함되어 있었다: lily-jev, lily-db-provisioner, lily-on-premise, lily-ingress-nginx, lily-get-secret, lily-loadbalancer, lily-load-test, lily-blog-sample, lily-blog-sample-fastapi, lily-blog-sample-fastapi-2nd, dummy-pipeline.

## 테스트

| 대상 | 결과 |
| --- | --- |
| frontend | 타입 검사, lint(오류 0·경고 5), 프로덕션 빌드, Vitest 150개 및 스크립트 테스트 2개 통과 |
| builder | Java 316개 중 311개 통과·5개 조건부 건너뜀. DynamoDB Local 연결 후 건너뛴 클라우드 상태·빌드 저장 테스트 2개도 통과해 총 313개 확인. 실제 JEV 호출 테스트 3개는 미실행. 엣지 JavaScript 70개 통과 |
| JEV | 12개 통과 |
| observer | 92개 통과 |
| CICD | 204개 중 175개 통과·29개 건너뜀(Testcontainers DB 환경 미연결) |
| DB provisioner | DynamoDB Local 연결 후 15개 통과 |
| on-premise | 184개 통과 |
| ingress-nginx | 38개 통과 |
| Java 블로그 샘플 | 5개 통과 |
| FastAPI 샘플 2개 | 각 6개 검사 통과: 화면, health, 게시물 생성·조회, 잘못된 입력 거절, slow API |
| dashboard | 타입 검사 및 프로덕션 빌드 통과. 자동 테스트 스크립트 없음 |
| dummy-pipeline | lint 및 프로덕션 빌드 통과. 자동 테스트 스크립트 없음 |
| get-secret·loadbalancer·공용 CI | YAML 39개 구문 검사 통과. 암호화된 값은 복호화하지 않음 |
| load-test | k6 JavaScript 2개 구문 검사 통과. 실제 서비스 부하 시험은 실행하지 않음 |

격리된 PostgreSQL에 인증·프로젝트 마이그레이션 전체를 적용했다. 로컬 프로덕션 서버에서 화면 응답, 회원가입, 이메일 미인증 로그인 차단(403), 인증 해제 옵션을 사용한 로그인, 인증된 프로젝트 조회, 미인증 요청 거절(401), 프로젝트 생성 및 수동 GCP 선택값 저장을 확인했다. BUILDER_URL을 비워 배포 실행기는 껐다. 테스트 서버와 임시 DB는 검사 후 종료했다.

## 병합 중 보완

- 프로젝트 INSERT의 웹훅·클라우드 선택·엣지 옵션 컬럼과 값 순서를 함께 유지했다. 실제 DB 프로젝트 생성으로 확인했다.
- AI 수정 진행 API 응답이 예상 형태인지 확인한 뒤 화면 상태에 반영하도록 보완하고 회귀 테스트 2개를 추가했다.
- StrictMode 테스트가 루트에서 실행되도록 조정하고, 자동 클라우드 선택 및 추가 계정 링크를 반영해 기존 UI 테스트를 갱신했다.
- CICD는 pgroll과 트래픽 라우터를 함께 초기화하며, 별칭 도메인 처리도 유지했다.

## 재현 시 참고

Java 테스트는 Docker의 JDK 21로 실행했다. Gradle 캐시를 공유하는 여러 컨테이너를 동시에 실행하면 파일 잠금이 충돌하므로 순서대로 실행했다. CPU 부하 때문에 처음 시간 초과가 났던 frontend·CICD 테스트는 작업 수를 줄이거나 순차 실행해 재검사했고 통과했다.

실제 JEV/Groq API 호출, AWS/GCP 리소스 생성, 운영 클러스터 배포·라우팅·DB 이전은 이번 검사 범위에 포함하지 않았다. 프로덕션 빌드 최초 실행은 미연결 DB 때문에 Better Auth 스키마 확인 경고가 있었으며, 이후 격리 DB 마이그레이션과 실제 인증 요청으로 확인했다. dummy-pipeline 설치에서 보안 취약점 5개(high)가 보고됐으며 의존성 강제 업그레이드는 하지 않았다.

frontend의 병합 전 작업 백업 stash는 남겨 두었다. builder의 로컬 AGENTS.md와 .agents/는 변경하거나 커밋하지 않았다.
