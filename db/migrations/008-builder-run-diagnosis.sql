-- 실패한 배포의 원인과 고칠 방법 (lily-builder Build.diagnosis). 화면이 입력 칸을 띄우거나 실행기가 자동으로 고쳐 다시 배포한다
ALTER TABLE builder_runs ADD COLUMN diagnosis jsonb;
