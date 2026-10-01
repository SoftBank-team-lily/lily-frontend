-- 배포 진행 상황. 실행기가 builder 상태(QUEUED·BUILDING·DEPLOYING·…)와 로그 끝부분을 주기마다 옮겨 둔다
-- 화면이 실제 단계와 로그를 보여 준다 (builder 는 클러스터 안에서만 열려 있다)
ALTER TABLE builder_runs ADD COLUMN stage text;
ALTER TABLE builder_runs ADD COLUMN logs jsonb NOT NULL DEFAULT '[]'::jsonb;
