-- M13: Rich text descriptions (Tiptap / ProseMirror JSON) stored alongside plain text.
-- `cards.description` remains the plain-text representation for legacy clients + FTS indexing.

alter table public.cards
  add column if not exists description_rich_json jsonb;

-- Backfill existing plain text into a minimal ProseMirror document.
update public.cards c
set description_rich_json = (
  select jsonb_build_object(
    'type',
    'doc',
    'content',
    jsonb_agg(
      case
        when line = '' then jsonb_build_object('type', 'paragraph')
        else jsonb_build_object(
          'type',
          'paragraph',
          'content',
          jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))
        )
      end
    )
  )
  from unnest(regexp_split_to_array(c.description, E'\\r?\\n')) as line
)
where c.description is not null
  and length(btrim(c.description)) > 0
  and c.description_rich_json is null;

