-- 배포 설정. 비우면 lily-builder 가 레포를 보고 정한다 (브랜치: 기본 브랜치, 포트: Dockerfile EXPOSE, 헬스: /)
-- root_dir: 앱이 있는 하위 폴더. 백엔드·프론트가 한 레포에 있으면 폴더마다 프로젝트를 하나씩 등록한다
ALTER TABLE projects
  ADD COLUMN branch text,
  ADD COLUMN root_dir text NOT NULL DEFAULT '',
  ADD COLUMN port integer CHECK (port BETWEEN 1 AND 65535),
  ADD COLUMN health_path text,
  -- 앱 환경변수 (KEY → 값). 배포할 때마다 그대로 넘긴다
  ADD COLUMN env jsonb NOT NULL DEFAULT '{}'::jsonb;
-- 같은 레포라도 폴더가 다르면 다른 프로젝트다
ALTER TABLE projects DROP CONSTRAINT projects_owner_id_repo_key;
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_repo_root_dir_key UNIQUE (owner_id, repo, root_dir);
