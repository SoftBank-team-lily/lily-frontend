-- 멀티클라우드: 클라우드 전용 프로젝트를 GCP 와 AWS 에 같이 띄운다 (lily-builder cloudProvider MULTI).
-- DB 는 GCP Cloud SQL 하나이고 AWS 쪽 Pod 는 DB 릴레이로 붙는다. 요청은 엣지 Worker 가 비율대로 나눈다.
-- 다른 값과 같이 만든 뒤에는 바꾸지 않는다.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_cloud_provider_check;
ALTER TABLE projects ADD CONSTRAINT projects_cloud_provider_check
  CHECK (cloud_provider IN ('AWS', 'GCP', 'MULTI'));
