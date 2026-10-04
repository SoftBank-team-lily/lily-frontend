-- 하이브리드의 클라우드. AWS(기본) 또는 GCP. 온프레미스 전용은 AWS 로 둔다 (클라우드를 쓰지 않는다).
-- 이 컬럼 전에 등록한 프로젝트는 AWS 다. 만든 뒤에는 바꾸지 않는다.
ALTER TABLE projects
  ADD COLUMN cloud_provider text NOT NULL DEFAULT 'AWS'
  CHECK (cloud_provider IN ('AWS', 'GCP'));
