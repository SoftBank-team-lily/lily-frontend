-- 등록할 때 사용자가 확인한 DB. lily-builder 가 감지한 값을 보여 주고 사용자가 고른다
-- null 이면 이전처럼 builder 가 배포할 때 레포를 보고 정한다 (이 컬럼 전에 등록한 프로젝트)
-- 등록한 뒤에는 바꾸지 않는다 (앱의 tenant DB 가 엔진마다 따로 생긴다)
ALTER TABLE projects ADD COLUMN database text CHECK (database IN ('postgres', 'mysql', 'none'));
