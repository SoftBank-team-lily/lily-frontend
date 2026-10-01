-- 저장소 push 를 받으면 이 값으로 서명을 확인한다. 프로젝트마다 다르고, 계정 화면에서 GitHub 웹훅 Secret 에 넣는다.
ALTER TABLE projects ADD COLUMN webhook_secret text;
CREATE INDEX projects_repo ON projects(repo);
