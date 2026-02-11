-- M2: Discord identity + guild/channel mapping tables (RLS enforced)

create or replace function public.current_discord_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.discord_user_id', true), '');
$$;

-- Uses Supabase Auth schema to ensure a user can only link the Discord account
-- they actually authenticated with.
create or replace function public.current_user_discord_provider_id()
returns text
language sql
stable
security definer
set search_path = auth, public
as $$
  select provider_id
  from auth.identities
  where user_id = public.current_user_id()
    and provider = 'discord'
  order by created_at desc
  limit 1;
$$;

create table if not exists public.discord_identities (
  discord_user_id text primary key,
  user_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.discord_guilds (
  guild_id text primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.discord_channel_mappings (
  guild_id text not null references public.discord_guilds(guild_id) on delete cascade,
  channel_id text not null,
  board_id uuid not null references public.boards(id) on delete cascade,
  default_list_id uuid references public.lists(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

create index if not exists idx_discord_identities_user_id on public.discord_identities(user_id);
create index if not exists idx_discord_guilds_org_id on public.discord_guilds(org_id);
create index if not exists idx_discord_channel_mappings_board_id on public.discord_channel_mappings(board_id);

alter table public.discord_identities enable row level security;
alter table public.discord_guilds enable row level security;
alter table public.discord_channel_mappings enable row level security;

alter table public.discord_identities force row level security;
alter table public.discord_guilds force row level security;
alter table public.discord_channel_mappings force row level security;

grant select, insert, update, delete on public.discord_identities to authenticated, service_role;
grant select, insert, update, delete on public.discord_guilds to authenticated, service_role;
grant select, insert, update, delete on public.discord_channel_mappings to authenticated, service_role;
grant execute on function public.current_discord_user_id() to authenticated, service_role;
grant execute on function public.current_user_discord_provider_id() to authenticated, service_role;

-- discord identities
drop policy if exists discord_identities_select_self on public.discord_identities;
create policy discord_identities_select_self on public.discord_identities
  for select
  using (user_id = public.current_user_id());

-- Internal API lookup path: allow selecting the row that matches the discord_user_id session claim.
drop policy if exists discord_identities_select_by_discord_claim on public.discord_identities;
create policy discord_identities_select_by_discord_claim on public.discord_identities
  for select
  using (discord_user_id = public.current_discord_user_id());

drop policy if exists discord_identities_manage_self on public.discord_identities;
create policy discord_identities_manage_self on public.discord_identities
  for all
  using (user_id = public.current_user_id())
  with check (
    user_id = public.current_user_id()
    and discord_user_id = public.current_user_discord_provider_id()
  );

-- discord guilds
drop policy if exists discord_guilds_select_policy on public.discord_guilds;
create policy discord_guilds_select_policy on public.discord_guilds
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists discord_guilds_manage_policy on public.discord_guilds;
create policy discord_guilds_manage_policy on public.discord_guilds
  for all
  using (public.has_org_role(org_id, array['admin']))
  with check (public.has_org_role(org_id, array['admin']));

-- discord channel mappings
drop policy if exists discord_channel_mappings_select_policy on public.discord_channel_mappings;
create policy discord_channel_mappings_select_policy on public.discord_channel_mappings
  for select
  using (
    exists (
      select 1
      from public.discord_guilds g
      where g.guild_id = guild_id
        and public.has_org_role(g.org_id, array['viewer', 'editor', 'admin'])
    )
  );

drop policy if exists discord_channel_mappings_manage_policy on public.discord_channel_mappings;
create policy discord_channel_mappings_manage_policy on public.discord_channel_mappings
  for all
  using (
    exists (
      select 1
      from public.discord_guilds g
      where g.guild_id = guild_id
        and public.has_org_role(g.org_id, array['admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.discord_guilds g
      where g.guild_id = guild_id
        and public.has_org_role(g.org_id, array['admin'])
    )
  );

