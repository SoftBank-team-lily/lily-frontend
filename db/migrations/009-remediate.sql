-- 로그 사고로 여는 PR. 동의는 기본 꺼짐. 커밋 SHA 가 없으면 PR 을 만들지 않는다.
ALTER TABLE projects ADD COLUMN remediate boolean NOT NULL DEFAULT false;
ALTER TABLE builder_runs ADD COLUMN commit_sha text;

CREATE TABLE remediation_prs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  app_name text NOT NULL,
  signature text NOT NULL,
  commit_sha text NOT NULL,
  status text NOT NULL CHECK (status IN ('opened', 'rejected')),
  reason text,
  pr_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX remediation_open_signature
  ON remediation_prs(project_id, signature)
  WHERE status = 'opened';
