-- M5: Deterministic card covers (CoverSpec + render output metadata).

create table if not exists public.card_covers (
  card_id uuid primary key references public.cards(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  job_id uuid not null,
  status text not null default 'queued',
  spec_json jsonb,
  bucket text,
  object_path text,
  content_type text,
  failure_reason text,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_covers_org_board
  on public.card_covers(org_id, board_id);
create index if not exists idx_card_covers_status
  on public.card_covers(status, updated_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'card_covers_status_check'
  ) then
    alter table public.card_covers
      add constraint card_covers_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

alter table public.card_covers enable row level security;
alter table public.card_covers force row level security;

grant select, insert, update, delete on public.card_covers to authenticated, service_role;

drop policy if exists card_covers_select_policy on public.card_covers;
create policy card_covers_select_policy on public.card_covers
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists card_covers_write_policy on public.card_covers;
create policy card_covers_write_policy on public.card_covers
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
