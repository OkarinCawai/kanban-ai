-- M12: Async board blueprint generation state and idempotent confirmation support.

create table if not exists public.board_generation_requests (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  requester_user_id uuid not null,
  prompt text not null,
  status text not null default 'queued',
  blueprint_json jsonb,
  created_board_id uuid references public.boards(id) on delete set null,
  source_event_id uuid unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_board_generation_requests_org
  on public.board_generation_requests(org_id, created_at);
create index if not exists idx_board_generation_requests_status
  on public.board_generation_requests(status, created_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'board_generation_requests_status_check'
  ) then
    alter table public.board_generation_requests
      add constraint board_generation_requests_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

alter table public.board_generation_requests enable row level security;
alter table public.board_generation_requests force row level security;

grant select, insert, update, delete on public.board_generation_requests to authenticated, service_role;

drop policy if exists board_generation_requests_select_policy on public.board_generation_requests;
create policy board_generation_requests_select_policy on public.board_generation_requests
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists board_generation_requests_insert_policy on public.board_generation_requests;
create policy board_generation_requests_insert_policy on public.board_generation_requests
  for insert
  with check (
    public.has_org_role(org_id, array['editor', 'admin'])
    and requester_user_id = public.current_user_id()
  );

drop policy if exists board_generation_requests_update_policy on public.board_generation_requests;
create policy board_generation_requests_update_policy on public.board_generation_requests
  for update
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));

