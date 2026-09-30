CREATE TABLE projects (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  repo text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, repo)
);
CREATE INDEX projects_owner_created ON projects(owner_id, created_at DESC, id DESC);

CREATE TABLE deployments (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'rolled-back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (project_id, request_key)
);
CREATE INDEX deployments_project_created ON deployments(project_id, created_at DESC, id DESC);

CREATE TABLE deployment_events (
  id text NOT NULL,
  deployment_id uuid NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'rolled-back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, id)
);

CREATE TABLE api_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);
