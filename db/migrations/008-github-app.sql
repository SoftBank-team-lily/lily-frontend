-- GitHub App 설치 하나당 릴리 계정 하나. 프로젝트는 그 설치가 볼 수 있는 저장소일 때만 연결한다.
CREATE TABLE github_installations (
  installation_id bigint PRIMARY KEY,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_login text NOT NULL CHECK (char_length(account_login) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX github_installations_owner ON github_installations(owner_id);

-- 설치 화면으로 보낼 때 발급하고, 돌아오면 한 번만 쓴다.
CREATE TABLE github_install_states (
  state text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

ALTER TABLE projects ADD COLUMN github_installation_id bigint;
CREATE INDEX projects_github_installation ON projects(github_installation_id)
  WHERE github_installation_id IS NOT NULL;
