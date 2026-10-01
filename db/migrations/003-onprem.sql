-- 배포 위치. cloud: lily-builder → k3s, onprem: 사용자 PC 의 에이전트 (lily-on-premise)
ALTER TABLE projects ADD COLUMN target text NOT NULL DEFAULT 'cloud' CHECK (target IN ('cloud', 'onprem'));

-- 사용자마다 에이전트(내 PC) 하나. agent_key 는 lily-builder 가 발급한 이름표다. 토큰은 저장하지 않는다
CREATE TABLE agents (
  owner_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  agent_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 배포 결과 주소 (lily-builder Build.url). 클라우드는 {앱}.apps.lilycloud.kr, 내 PC 는 에이전트의 공개 주소
ALTER TABLE builder_runs ADD COLUMN url text;
