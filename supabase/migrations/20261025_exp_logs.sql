-- 경험 로그(질문·설계 사례) — 90일 보관, 동의한 사용자만. 서버(service role)만 접근한다(RLS 켜고 정책 없음 = 전부 거부).
-- 구글 로그인 연동(user_id)은 다음 단계에서 정책을 추가한다.
create table if not exists public.exp_turns (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid,
  feature text not null check (feature in ('chat','drone-builder')),
  stage text,
  question text not null,
  status text not null default 'answered',
  basis text,
  classes text[] not null default '{}',
  doc_slugs text[] not null default '{}',
  model_tier text,
  latency_ms int,
  is_test boolean not null default false,
  consent_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists exp_turns_created on public.exp_turns (created_at);
create index if not exists exp_turns_feature_status on public.exp_turns (feature, status, created_at) where not is_test;

create table if not exists public.exp_design_cases (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid,
  run_hash text not null,
  concept text not null,
  inputs jsonb not null default '{}',
  final_spec jsonb not null default '{}',
  gate_summary jsonb not null default '{}',
  approved_stages text[] not null default '{}',
  closed_at text,
  outcome text not null default 'final',
  rejections jsonb not null default '[]',
  verification text not null default 'analytic-gates-only',   -- 실기 비행 검증이 아니다
  markdown_gz_b64 text not null,
  md_chars int not null default 0,
  is_test boolean not null default false,
  consent_version text not null,
  created_at timestamptz not null default now(),
  unique (session_id, run_hash)
);
create index if not exists exp_cases_created on public.exp_design_cases (created_at);

-- 30일 지난 원본은 집계로 남기고, 90일이 지나면 원본을 지운다(테스트 제외 집계).
create table if not exists public.exp_daily_rollup (
  day date not null, feature text not null, status text not null, n int not null,
  primary key (day, feature, status)
);

alter table public.exp_turns enable row level security;
alter table public.exp_design_cases enable row level security;
alter table public.exp_daily_rollup enable row level security;

-- service_role은 RLS를 우회하지만 PostgREST용 권한(grants)은 명시한다(2026-10-30부터 기존 무료 프로젝트에도 필요할 수 있음).
grant usage on schema public to service_role;
grant all on public.exp_turns, public.exp_design_cases, public.exp_daily_rollup to service_role;

create or replace function public.exp_retention() returns void language plpgsql security definer set search_path = public as $$
begin
  insert into exp_daily_rollup (day, feature, status, n)
    select created_at::date, feature, status, count(*) from exp_turns
    where not is_test and created_at < now() - interval '30 days'
    group by 1,2,3
    on conflict (day, feature, status) do update set n = greatest(exp_daily_rollup.n, excluded.n);
  delete from exp_turns where created_at < now() - interval '90 days';
  delete from exp_design_cases where created_at < now() - interval '90 days';
end $$;
revoke all on function public.exp_retention() from public, anon, authenticated;

-- (2026-10-25 적용) 서버는 '넣기 전용' publishable(anon) 키만 가진다: 읽기·수정·삭제 정책이 없어 키가 새도 데이터는 읽히지 않는다.
grant insert on public.exp_turns, public.exp_design_cases to anon;
create policy exp_turns_insert_only on public.exp_turns for insert to anon
  with check (feature in ('chat','drone-builder') and char_length(question) <= 2200 and char_length(session_id) between 8 and 64 and consent_version <> '');
create policy exp_cases_insert_only on public.exp_design_cases for insert to anon
  with check (char_length(markdown_gz_b64) <= 400000 and char_length(concept) <= 1200 and char_length(session_id) between 8 and 64 and consent_version <> '');
-- 90일 삭제: select cron.schedule('exp-retention', '0 18 * * *', $$select public.exp_retention()$$);  (pg_cron, 매일 03:00 KST)
