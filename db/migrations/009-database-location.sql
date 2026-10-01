-- 온프레미스 앱의 DB 위치. local: 에이전트가 사용자 PC 에 띄운 DB, external: 사용자가 준 DB 주소(database_url),
-- cloud: 클라우드 RDS 를 터널로 (데이터가 클라우드에 있다). null 이면 cloud (이 컬럼 전에 등록한 프로젝트)
-- 클라우드 프로젝트는 쓰지 않는다. 등록한 뒤에는 바꾸지 않는다 (DB 가 다른 곳에 새로 생긴다)
ALTER TABLE projects
  ADD COLUMN database_location text CHECK (database_location IN ('local', 'external', 'cloud')),
  -- external 일 때만. 비밀번호가 들어 있어 화면에는 돌려주지 않는다 (env 값과 같은 취급)
  ADD COLUMN database_url text;
