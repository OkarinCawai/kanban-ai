-- M4: Thread-to-card async extraction state and idempotent confirmation support.

create table if not exists public.thread_card_extractions (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  requester_user_id uuid not null,
  source_guild_id text not null,
  source_channel_id text not null,
  source_thread_id text not null,
  source_thread_name text not null,
  participant_discord_user_ids text[] not null default '{}'::text[],
  transcript_text text not null,
  status text not null default 'queued',
  draft_json jsonb,
  created_card_id uuid references public.cards(id) on delete set null,
  source_event_id uuid unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_thread_card_extractions_org_board
  on public.thread_card_extractions(org_id, board_id);
create index if not exists idx_thread_card_extractions_status
  on public.thread_card_extractions(status, created_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'thread_card_extractions_status_check'
  ) then
    alter table public.thread_card_extractions
      add constraint thread_card_extractions_status_check
      check (status in ('queued', 'processing', 'completed', 'failed'));
  end if;
end
$$;

alter table public.thread_card_extractions enable row level security;
alter table public.thread_card_extractions force row level security;

grant select, insert, update, delete on public.thread_card_extractions to authenticated, service_role;

drop policy if exists thread_card_extractions_select_policy on public.thread_card_extractions;
create policy thread_card_extractions_select_policy on public.thread_card_extractions
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists thread_card_extractions_insert_policy on public.thread_card_extractions;
create policy thread_card_extractions_insert_policy on public.thread_card_extractions
  for insert
  with check (
    public.has_org_role(org_id, array['editor', 'admin'])
    and requester_user_id = public.current_user_id()
  );

drop policy if exists thread_card_extractions_update_policy on public.thread_card_extractions;
create policy thread_card_extractions_update_policy on public.thread_card_extractions
  for update
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));
