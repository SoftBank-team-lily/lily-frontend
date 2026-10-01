-- 배포 기록을 lily-builder 의 빌드로 보낸 기록. 서버 재시작 후에도 진행 중인 빌드를 이어서 확인한다.
CREATE TABLE builder_runs (
  deployment_id uuid PRIMARY KEY REFERENCES deployments(id) ON DELETE CASCADE,
  build_id text NOT NULL,
  app_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
