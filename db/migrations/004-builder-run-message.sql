-- 배포 결과 한 줄 (실패 이유). 목록에서 왜 실패했는지 보여 준다
ALTER TABLE builder_runs ADD COLUMN message text;
-- builder 로 보내기 전에 실패한 배포(내 PC 미연결, 허용되지 않은 레포 등)도 이유를 남기려고 빌드 id 없이 둔다
ALTER TABLE builder_runs ALTER COLUMN build_id DROP NOT NULL;
