-- M15: Intelligent agents (suggestion-first).

create table if not exists public.card_triage_suggestions (
  card_id uuid primary key references public.cards(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  job_id uuid not null,
  status text not null default 'queued',
  suggestions_json jsonb,
  failure_reason text,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_breakdown_suggestions (
  card_id uuid primary key references public.cards(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  requester_user_id uuid not null,
  job_id uuid not null,
  status text not null default 'queued',
  breakdown_json jsonb,
  failure_reason text,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_triage_suggestions_org_board
  on public.card_triage_suggestions(org_id, board_id);
create index if not exists idx_card_triage_suggestions_status
  on public.card_triage_suggestions(status, updated_at);

create index if not exists idx_card_breakdown_suggestions_org_board
  on public.card_breakdown_suggestions(org_id, board_id);
create index if not exists idx_card_breakdown_suggestions_status
  on public.card_breakdown_suggestions(status, updated_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'card_triage_suggestions_status_check'
  ) then
    alter table public.card_triage_suggestions
      add constraint card_triage_suggestions_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'card_breakdown_suggestions_status_check'
  ) then
    alter table public.card_breakdown_suggestions
      add constraint card_breakdown_suggestions_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

alter table public.card_triage_suggestions enable row level security;
alter table public.card_triage_suggestions force row level security;
alter table public.card_breakdown_suggestions enable row level security;
alter table public.card_breakdown_suggestions force row level security;

grant select, insert, update, delete on public.card_triage_suggestions to authenticated, service_role;
grant select, insert, update, delete on public.card_breakdown_suggestions to authenticated, service_role;

drop policy if exists card_triage_suggestions_select_policy on public.card_triage_suggestions;
create policy card_triage_suggestions_select_policy on public.card_triage_suggestions
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists card_triage_suggestions_write_policy on public.card_triage_suggestions;
create policy card_triage_suggestions_write_policy on public.card_triage_suggestions
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
    and exists (
      select 1
      from public.cards c
      where c.id = card_id
        and c.org_id = org_id
        and c.board_id = board_id
    )
  );

drop policy if exists card_breakdown_suggestions_select_policy on public.card_breakdown_suggestions;
create policy card_breakdown_suggestions_select_policy on public.card_breakdown_suggestions
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists card_breakdown_suggestions_insert_policy on public.card_breakdown_suggestions;
create policy card_breakdown_suggestions_insert_policy on public.card_breakdown_suggestions
  for insert
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
    and requester_user_id = public.current_user_id()
    and exists (
      select 1
      from public.cards c
      where c.id = card_id
        and c.org_id = org_id
        and c.board_id = board_id
    )
  );

drop policy if exists card_breakdown_suggestions_update_policy on public.card_breakdown_suggestions;
create policy card_breakdown_suggestions_update_policy on public.card_breakdown_suggestions
  for update
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
    and exists (
      select 1
      from public.cards c
      where c.id = card_id
        and c.org_id = org_id
        and c.board_id = board_id
    )
  );

