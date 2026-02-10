create extension if not exists pgcrypto;

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id uuid not null,
  org_id uuid not null references public.orgs(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  title text not null,
  description text,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null,
  position numeric not null default 0,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  title text not null,
  description text,
  position numeric not null default 0,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  next_retry_at timestamptz
);

create index if not exists idx_boards_org_id on public.boards(org_id);
create index if not exists idx_lists_board_id on public.lists(board_id);
create index if not exists idx_cards_list_id on public.cards(list_id);
create index if not exists idx_cards_board_id on public.cards(board_id);
create index if not exists idx_outbox_retry on public.outbox_events(next_retry_at, processed_at);

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.org_id', true), '')::uuid;
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = public.current_user_id()
      and m.org_id = target_org_id
      and m.role = any(allowed_roles)
  );
$$;

alter table public.orgs enable row level security;
alter table public.memberships enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.lists enable row level security;
alter table public.cards enable row level security;
alter table public.outbox_events enable row level security;

alter table public.orgs force row level security;
alter table public.memberships force row level security;
alter table public.boards force row level security;
alter table public.board_members force row level security;
alter table public.lists force row level security;
alter table public.cards force row level security;
alter table public.outbox_events force row level security;

grant usage on schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

drop policy if exists orgs_select_policy on public.orgs;
create policy orgs_select_policy on public.orgs
  for select
  using (public.has_org_role(id, array['viewer', 'editor', 'admin']));

drop policy if exists memberships_select_policy on public.memberships;
create policy memberships_select_policy on public.memberships
  for select
  using (
    user_id = public.current_user_id()
    or public.has_org_role(org_id, array['admin'])
  );

drop policy if exists memberships_manage_policy on public.memberships;
create policy memberships_manage_policy on public.memberships
  for all
  using (public.has_org_role(org_id, array['admin']))
  with check (public.has_org_role(org_id, array['admin']));

drop policy if exists boards_read_policy on public.boards;
create policy boards_read_policy on public.boards
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists boards_write_policy on public.boards;
create policy boards_write_policy on public.boards
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
  );

drop policy if exists board_members_read_policy on public.board_members;
create policy board_members_read_policy on public.board_members
  for select
  using (
    user_id = public.current_user_id()
    or exists (
      select 1
      from public.boards b
      where b.id = board_id
        and public.has_org_role(b.org_id, array['admin'])
    )
  );

drop policy if exists board_members_write_policy on public.board_members;
create policy board_members_write_policy on public.board_members
  for all
  using (
    exists (
      select 1
      from public.boards b
      where b.id = board_id
        and public.has_org_role(b.org_id, array['admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.boards b
      where b.id = board_id
        and public.has_org_role(b.org_id, array['admin'])
    )
  );

drop policy if exists lists_read_policy on public.lists;
create policy lists_read_policy on public.lists
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists lists_write_policy on public.lists;
create policy lists_write_policy on public.lists
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
  );

drop policy if exists cards_read_policy on public.cards;
create policy cards_read_policy on public.cards
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists cards_write_policy on public.cards;
create policy cards_write_policy on public.cards
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
  );

drop policy if exists outbox_events_insert_policy on public.outbox_events;
create policy outbox_events_insert_policy on public.outbox_events
  for insert
  with check (
    org_id = public.current_org_id()
    and public.has_org_role(org_id, array['editor', 'admin'])
  );

drop policy if exists outbox_events_read_policy on public.outbox_events;
create policy outbox_events_read_policy on public.outbox_events
  for select
  using (public.has_org_role(org_id, array['admin']));
