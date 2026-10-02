-- 온프레미스 앱의 클라우드 버스팅 설정 (화면에서 정한 값). 에이전트는 메모리에만 들고 있어서
-- 에이전트를 다시 띄우면 잊는다. 화면이 이 값과 에이전트가 보낸 상태를 비교해 다시 보낸다
-- burst_cloud_percent: 대기 Pod 가 닿은 뒤 클라우드로 보내는 요청 비율. 0 이어도 대기 Pod 1대는 둔다
ALTER TABLE projects
  ADD COLUMN burst_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN burst_cloud_percent smallint NOT NULL DEFAULT 0
    CHECK (burst_cloud_percent BETWEEN 0 AND 100);
