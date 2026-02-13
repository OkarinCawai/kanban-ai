-- M11: Postgres full-text search over cards (title + description + key metadata).

alter table public.cards
  add column if not exists search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(location_text, '')), 'C')
  ) stored;

create index if not exists idx_cards_search_tsv on public.cards using gin (search_tsv);

