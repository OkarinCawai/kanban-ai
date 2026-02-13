-- M11: Include labels in Postgres full-text search over cards.

drop index if exists idx_cards_search_tsv;

alter table public.cards
  drop column if exists search_tsv;

alter table public.cards
  add column search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(location_text, '')), 'C') ||
    setweight(
      to_tsvector('english', coalesce(jsonb_path_query_array(labels_json, '$[*].name')::text, '')),
      'C'
    )
  ) stored;

create index if not exists idx_cards_search_tsv on public.cards using gin (search_tsv);

