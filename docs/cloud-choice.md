# 배포 클라우드 자동·수동 선택

신규 클라우드/하이브리드 프로젝트는 기본 자동 모드다. 수동 모드를 선택하면 AWS/GCP 제공자 카드가 나타난다. 온프레미스 전용에는 이 선택이 없다.

자동: 인증된 프로젝트 등록 API → builder `/api/cloud/selection` → 저장소 의존성 근거 추출 → 공유 JEV의 제공자 질문 → 준비된 AWS/GCP 후보 선택 → `projects.cloud_provider` 저장 → 기존 실행기가 해당 `cloudProvider`로 배포.

판단 결과의 모드와 JEV 신뢰도·분석 커밋 요약도 저장한다. 기존 프로젝트는 manual로 유지하고, 재배포 시 기존 제공자를 사용한다. 제공자 변경은 인프라·DB 이전 작업이 필요하므로 이 기능에서 수행하지 않는다. 분석 커밋은 판단 시점의 기록이며, 기존 배포는 요청 브랜치의 최신 커밋을 사용한다.

저장소 적합성을 판단하는 기능이다. 실제 가격·P95 카탈로그를 쓰는 영속 planId 배포 API는 별도로 유지하며, 이번 등록 흐름에서는 사용하지 않는다. 전체 소스·로그 분석은 수행하지 않는다. 의존성 설치가 실제 서비스 사용을 확정하지도 않는다. 선택 불가, 작업기 미설정, JEV 오류는 자동으로 AWS로 대체하지 않고 이유를 표시한다.

## 적용 순서

1. builder의 feature/cloud-choice를 배포한다.
2. builder에 JEV_API_KEY, CLOUD_API_TOKEN(32자 이상), CLOUD_AWS_URL/REGION, CLOUD_GCP_URL/REGION을 설정한다. 준비된 제공자만 선택 후보가 된다. 각 worker는 실제 배포 설정이 준비되어야 한다. 한 builder가 cloudProvider로 라우팅하면 두 URL을 같은 주소로 설정할 수 있다.
3. frontend에 BUILDER_URL과 같은 CLOUD_API_TOKEN을 설정한다. 키는 서버에만 둔다.
4. `npm run db:migrate`로 016-cloud-selection.sql을 적용하고 frontend를 배포한다. 기존 프로젝트를 수동 모드로 보존한다.

로컬의 코드 결함 판별 REMEDIATE_JEV_YES_THRESHOLD=0.6은 자동 클라우드 선택 기준에 영향을 주지 않는다. 자동 선택은 최소 0.8을 사용한다. 두 서버의 모델·설정이 준비되지 않으면 기본 자동 등록은 보류되므로 수동 모드를 선택할 수 있다.
