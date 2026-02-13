-- M6: Hygiene and digests (stuck-card detection + weekly recaps).

create table if not exists public.board_weekly_recaps (
  board_id uuid primary key references public.boards(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null,
  status text not null default 'queued',
  period_start timestamptz not null,
  period_end timestamptz not null,
  recap_json jsonb,
  failure_reason text,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_daily_standups (
  board_id uuid primary key references public.boards(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null,
  status text not null default 'queued',
  period_start timestamptz not null,
  period_end timestamptz not null,
  standup_json jsonb,
  failure_reason text,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_stuck_reports (
  board_id uuid primary key references public.boards(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null,
  status text not null default 'queued',
  threshold_days integer not null default 7,
  as_of timestamptz not null,
  report_json jsonb,
  failure_reason text,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_board_weekly_recaps_org_board
  on public.board_weekly_recaps(org_id, board_id);
create index if not exists idx_board_weekly_recaps_status
  on public.board_weekly_recaps(status, updated_at);

create index if not exists idx_board_daily_standups_org_board
  on public.board_daily_standups(org_id, board_id);
create index if not exists idx_board_daily_standups_status
  on public.board_daily_standups(status, updated_at);

create index if not exists idx_board_stuck_reports_org_board
  on public.board_stuck_reports(org_id, board_id);
create index if not exists idx_board_stuck_reports_status
  on public.board_stuck_reports(status, updated_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'board_weekly_recaps_status_check'
  ) then
    alter table public.board_weekly_recaps
      add constraint board_weekly_recaps_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'board_daily_standups_status_check'
  ) then
    alter table public.board_daily_standups
      add constraint board_daily_standups_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'board_stuck_reports_status_check'
  ) then
    alter table public.board_stuck_reports
      add constraint board_stuck_reports_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'board_stuck_reports_threshold_days_check'
  ) then
    alter table public.board_stuck_reports
      add constraint board_stuck_reports_threshold_days_check
      check (threshold_days > 0 and threshold_days <= 60);
  end if;
end
$$;

alter table public.board_weekly_recaps enable row level security;
alter table public.board_weekly_recaps force row level security;
alter table public.board_daily_standups enable row level security;
alter table public.board_daily_standups force row level security;
alter table public.board_stuck_reports enable row level security;
alter table public.board_stuck_reports force row level security;

grant select, insert, update, delete on public.board_weekly_recaps to authenticated, service_role;
grant select, insert, update, delete on public.board_daily_standups to authenticated, service_role;
grant select, insert, update, delete on public.board_stuck_reports to authenticated, service_role;

drop policy if exists board_weekly_recaps_select_policy on public.board_weekly_recaps;
create policy board_weekly_recaps_select_policy on public.board_weekly_recaps
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists board_weekly_recaps_write_policy on public.board_weekly_recaps;
create policy board_weekly_recaps_write_policy on public.board_weekly_recaps
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
    and exists (
      select 1
      from public.boards b
      where b.id = board_id
        and b.org_id = org_id
    )
  );

drop policy if exists board_daily_standups_select_policy on public.board_daily_standups;
create policy board_daily_standups_select_policy on public.board_daily_standups
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists board_daily_standups_write_policy on public.board_daily_standups;
create policy board_daily_standups_write_policy on public.board_daily_standups
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
    and exists (
      select 1
      from public.boards b
      where b.id = board_id
        and b.org_id = org_id
    )
  );

drop policy if exists board_stuck_reports_select_policy on public.board_stuck_reports;
create policy board_stuck_reports_select_policy on public.board_stuck_reports
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists board_stuck_reports_write_policy on public.board_stuck_reports;
create policy board_stuck_reports_write_policy on public.board_stuck_reports
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
    and exists (
      select 1
      from public.boards b
      where b.id = board_id
        and b.org_id = org_id
    )
  );
