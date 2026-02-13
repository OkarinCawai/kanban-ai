-- M11 (optional): Async semantic card search requests + results.

create table if not exists public.card_semantic_search_requests (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  requester_user_id uuid not null,
  query_text text not null,
  top_k integer not null default 20,
  status text not null default 'queued',
  hits_json jsonb,
  source_event_id uuid unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_semantic_search_requests_org_board
  on public.card_semantic_search_requests(org_id, board_id, created_at);
create index if not exists idx_card_semantic_search_requests_status
  on public.card_semantic_search_requests(status, created_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'card_semantic_search_requests_status_check'
  ) then
    alter table public.card_semantic_search_requests
      add constraint card_semantic_search_requests_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

alter table public.card_semantic_search_requests enable row level security;
alter table public.card_semantic_search_requests force row level security;

grant select, insert, update, delete on public.card_semantic_search_requests to authenticated, service_role;

drop policy if exists card_semantic_search_requests_select_policy
  on public.card_semantic_search_requests;
create policy card_semantic_search_requests_select_policy
  on public.card_semantic_search_requests
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists card_semantic_search_requests_insert_policy
  on public.card_semantic_search_requests;
create policy card_semantic_search_requests_insert_policy
  on public.card_semantic_search_requests
  for insert
  with check (
    public.has_org_role(org_id, array['viewer', 'editor', 'admin'])
    and requester_user_id = public.current_user_id()
  );

drop policy if exists card_semantic_search_requests_update_policy
  on public.card_semantic_search_requests;
create policy card_semantic_search_requests_update_policy
  on public.card_semantic_search_requests
  for update
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));

