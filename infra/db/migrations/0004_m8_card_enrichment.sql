-- M8: Trello-style card enrichment fields (details + board badge metadata).

alter table public.cards
  add column if not exists start_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists location_text text,
  add column if not exists location_url text,
  add column if not exists assignee_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists labels_json jsonb not null default '[]'::jsonb,
  add column if not exists checklist_json jsonb not null default '[]'::jsonb,
  add column if not exists comment_count integer not null default 0,
  add column if not exists attachment_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cards_due_after_start_check'
  ) then
    alter table public.cards
      add constraint cards_due_after_start_check
      check (start_at is null or due_at is null or due_at >= start_at);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cards_comment_count_nonnegative'
  ) then
    alter table public.cards
      add constraint cards_comment_count_nonnegative
      check (comment_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cards_attachment_count_nonnegative'
  ) then
    alter table public.cards
      add constraint cards_attachment_count_nonnegative
      check (attachment_count >= 0);
  end if;
end
$$;

create index if not exists idx_cards_due_at on public.cards(due_at);
