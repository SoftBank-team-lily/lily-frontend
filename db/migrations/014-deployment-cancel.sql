-- 사용자가 진행 중인 배포를 멈춘 상태. 새 버전은 띄우지 않았고 트래픽은 이전 버전 그대로다.
-- queued·running 에서만 들어가고, 들어간 뒤에는 바뀌지 않는다 (recordEvent 전환 규칙).
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_status_check;
ALTER TABLE deployments ADD CONSTRAINT deployments_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'rolled-back', 'cancelled'));
ALTER TABLE deployment_events DROP CONSTRAINT IF EXISTS deployment_events_status_check;
ALTER TABLE deployment_events ADD CONSTRAINT deployment_events_status_check
  CHECK (status IN ('running', 'succeeded', 'failed', 'rolled-back', 'cancelled'));
