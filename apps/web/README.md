# Web App (M1)

## Run

1. Start API:
   - `npm run build --workspace @kanban/api`
   - `node dist/src/main.js` from `apps/api` (or your preferred dev command)
2. Start web static server:
   - `npm run start --workspace @kanban/web`
3. Open:
   - `http://localhost:3002`

## Notes

- The page uses API headers (`x-user-id`, `x-org-id`, `x-role`) from the form.
- Card drag-and-drop issues `PATCH /cards/:cardId/move` requests with optimistic local updates.
