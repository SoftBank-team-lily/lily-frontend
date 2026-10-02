-- 클라우드 앱을 내 PC 로 옮긴다 (AWS → 온프레미스 전환). 공개 주소({app}.apps...)는 그대로 두고
-- 클러스터 Ingress 가 요청을 내 PC 의 공개 주소로 넘긴다 (lily-cicd OnPremUpstream).
--
-- projects.app_name: 앱 이름 고정. 공개 주소·Ingress·RDS DB 가 이 이름이라 옮긴 뒤 다시 배포해도 같은 이름으로 보낸다.
--                    null 이면 지금까지처럼 레포 이름으로 정한다
ALTER TABLE projects ADD COLUMN app_name text;

-- deployments.move: 이 배포가 하는 일. onprem: 내 PC 에 배포한 뒤 Ingress 를 내 PC 로 넘기고 클라우드를 내린다
-- deployments.move_database: 옮길 때 DB 위치. cloud: RDS 를 그대로 (터널), local: RDS 데이터를 내 PC DB 로 옮긴다.
--                            DB 없는 앱은 null
ALTER TABLE deployments
  ADD COLUMN move text CHECK (move IN ('onprem')),
  ADD COLUMN move_database text CHECK (move_database IN ('cloud', 'local'));
