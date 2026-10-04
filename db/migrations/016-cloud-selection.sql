-- 기존 프로젝트의 제공자는 그대로 유지한다. 신규 등록의 기본 자동 선택은 API에서 정한다.
ALTER TABLE projects ADD COLUMN cloud_selection text NOT NULL DEFAULT 'manual'
  CHECK (cloud_selection IN ('auto', 'manual'));
ALTER TABLE projects ADD COLUMN cloud_selection_reason text;
