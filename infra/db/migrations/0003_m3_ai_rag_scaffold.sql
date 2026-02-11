-- M3 scaffold: AI summaries, ask-board requests, and permission-scoped RAG storage.

create table if not exists public.card_summaries (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  card_id uuid not null unique references public.cards(id) on delete cascade,
  status text not null default 'queued',
  summary_json jsonb,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_ask_requests (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  requester_user_id uuid not null,
  question text not null,
  top_k integer not null default 8,
  status text not null default 'queued',
  answer_json jsonb,
  source_event_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  title text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table if not exists public.document_chunks (
  id uuid primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.document_embeddings (
  id uuid primary key,
  chunk_id uuid not null unique references public.document_chunks(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  model text not null,
  embedding real[] not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_card_summaries_org_board on public.card_summaries(org_id, board_id);
create index if not exists idx_ai_ask_requests_org_board on public.ai_ask_requests(org_id, board_id);
create index if not exists idx_documents_org_board on public.documents(org_id, board_id);
create index if not exists idx_document_chunks_org_board on public.document_chunks(org_id, board_id);
create index if not exists idx_document_embeddings_org_board on public.document_embeddings(org_id, board_id);

alter table public.card_summaries enable row level security;
alter table public.ai_ask_requests enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.document_embeddings enable row level security;

alter table public.card_summaries force row level security;
alter table public.ai_ask_requests force row level security;
alter table public.documents force row level security;
alter table public.document_chunks force row level security;
alter table public.document_embeddings force row level security;

grant select, insert, update, delete on public.card_summaries to authenticated, service_role;
grant select, insert, update, delete on public.ai_ask_requests to authenticated, service_role;
grant select, insert, update, delete on public.documents to authenticated, service_role;
grant select, insert, update, delete on public.document_chunks to authenticated, service_role;
grant select, insert, update, delete on public.document_embeddings to authenticated, service_role;

drop policy if exists card_summaries_select_policy on public.card_summaries;
create policy card_summaries_select_policy on public.card_summaries
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists card_summaries_write_policy on public.card_summaries;
create policy card_summaries_write_policy on public.card_summaries
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));

drop policy if exists ai_ask_requests_select_policy on public.ai_ask_requests;
create policy ai_ask_requests_select_policy on public.ai_ask_requests
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists ai_ask_requests_insert_policy on public.ai_ask_requests;
create policy ai_ask_requests_insert_policy on public.ai_ask_requests
  for insert
  with check (
    public.has_org_role(org_id, array['viewer', 'editor', 'admin'])
    and requester_user_id = public.current_user_id()
  );

drop policy if exists ai_ask_requests_update_policy on public.ai_ask_requests;
create policy ai_ask_requests_update_policy on public.ai_ask_requests
  for update
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));

drop policy if exists documents_select_policy on public.documents;
create policy documents_select_policy on public.documents
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists documents_write_policy on public.documents;
create policy documents_write_policy on public.documents
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));

drop policy if exists document_chunks_select_policy on public.document_chunks;
create policy document_chunks_select_policy on public.document_chunks
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists document_chunks_write_policy on public.document_chunks;
create policy document_chunks_write_policy on public.document_chunks
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));

drop policy if exists document_embeddings_select_policy on public.document_embeddings;
create policy document_embeddings_select_policy on public.document_embeddings
  for select
  using (public.has_org_role(org_id, array['viewer', 'editor', 'admin']));

drop policy if exists document_embeddings_write_policy on public.document_embeddings;
create policy document_embeddings_write_policy on public.document_embeddings
  for all
  using (public.has_org_role(org_id, array['editor', 'admin']))
  with check (public.has_org_role(org_id, array['editor', 'admin']));
