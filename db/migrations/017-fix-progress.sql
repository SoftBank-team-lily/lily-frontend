-- 수정 작업의 단계만 저장한다. 로그·프롬프트·파일 내용·토큰은 저장하지 않는다.
CREATE TABLE fix_runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  signature text NOT NULL,
  source_commit text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('accepted','drafting','checking','opening-pr','review')),
  status text NOT NULL CHECK (status IN ('running','review','skipped','failed')),
  reason_code text,
  files jsonb NOT NULL DEFAULT '[]',
  events jsonb NOT NULL DEFAULT '[]',
  pr_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  UNIQUE(project_id, deployment_id, signature)
);
CREATE INDEX fix_runs_recent ON fix_runs(project_id, created_at DESC);
