-- 온프레미스 앱의 PC 장애 대비 (lily-builder 엣지 Worker). 배포 화면의 체크박스 두 개다.
-- edge_snapshot: 장애 중 읽기 사본 (Cloudflare Cache API). edge_queue: 장애 중 쓰기 보관 (Durable Object, 모든 POST).
-- 새 온프레미스 프로젝트는 둘 다 true 로 만든다. null 이면 이 컬럼 전에 등록한 프로젝트이고, 배포할 때 builder 에 보내지 않아
-- 앱의 지금 엣지 설정을 그대로 둔다. 클라우드 프로젝트는 쓰지 않는다 (null).
ALTER TABLE projects
  ADD COLUMN edge_snapshot boolean,
  ADD COLUMN edge_queue boolean;
