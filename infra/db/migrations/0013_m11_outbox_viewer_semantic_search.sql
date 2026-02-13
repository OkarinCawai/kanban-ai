-- M11 (optional): Allow viewer role to enqueue safe semantic search jobs via outbox.
-- Mirrors M9 viewer ask-board enqueue rules while keeping outbox locked down otherwise.

drop policy if exists outbox_events_insert_policy on public.outbox_events;
create policy outbox_events_insert_policy on public.outbox_events
  for insert
  with check (
    org_id = public.current_org_id()
    and (
      -- Editor/admin can enqueue any outbox event types.
      public.has_org_role(org_id, array['editor', 'admin'])
      or (
        -- Viewers may enqueue ask-board and semantic card search only, and only for themselves.
        type in ('ai.ask-board.requested', 'ai.card-semantic-search.requested')
        and public.has_org_role(org_id, array['viewer', 'editor', 'admin'])
        and (payload->>'actorUserId')::uuid = public.current_user_id()
        and (payload->>'jobId')::uuid = id
        and (payload->>'boardId')::uuid = board_id
        and exists (
          select 1
          from public.boards b
          where b.id = board_id
            and b.org_id = org_id
        )
      )
    )
  );

