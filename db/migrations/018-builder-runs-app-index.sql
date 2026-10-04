-- 사건 접수(src/lib/remediate/accept.ts)가 앱 이름으로 가장 최근 배포를 찾는다. 배포 이력이 쌓여도 전체를 훑지 않게 한다.
CREATE INDEX IF NOT EXISTS builder_runs_app_created ON builder_runs (app_name, created_at DESC);
