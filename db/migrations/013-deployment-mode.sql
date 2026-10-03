-- HYBRID: DB 는 RDS. 거점(cloud|onprem)만 바뀐다. 버스팅·거점 전환을 쓴다.
-- ONPREM_ONLY: DB 와 요청 모두 내 PC. 버스팅·거점 전환·RDS 를 쓰지 않는다.
-- 이 컬럼 전에 등록한 프로젝트는 HYBRID 다. 만든 뒤에는 바꾸지 않는다.
ALTER TABLE projects
  ADD COLUMN deployment_mode text NOT NULL DEFAULT 'HYBRID'
  CHECK (deployment_mode IN ('HYBRID', 'ONPREM_ONLY'));
