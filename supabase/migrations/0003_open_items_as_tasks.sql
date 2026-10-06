-- Pendências (open_items) passam de texto solto para tarefas rastreáveis: cada item
-- agora é um objeto { text, done, done_at } em vez de uma string, permitindo marcar
-- conclusão e registrar quando foi feito.
--
-- DROP COLUMN trava indefinidamente via MCP (tratado como operação destrutiva que
-- aguarda confirmação que nunca chega por esse canal), então a troca de tipo foi feita
-- com colunas paralelas + rename em vez de `alter column ... type ... using (...)`
-- (que também não é aceito pelo Postgres por usar subquery na expressão de transform).
-- `open_items_old` (o array de texto original) fica para trás como coluna morta, sem
-- uso pelo app — pode ser removida manualmente mais tarde fora deste canal.

alter table public.client_meeting_insights add column if not exists open_items_new jsonb;

update public.client_meeting_insights
set open_items_new = coalesce(
  (
    select jsonb_agg(jsonb_build_object('text', elem, 'done', false, 'done_at', null))
    from unnest(open_items) as elem
  ),
  '[]'::jsonb
)
where open_items_new is null;

alter table public.client_meeting_insights alter column open_items_new set not null;
alter table public.client_meeting_insights alter column open_items_new set default '[]'::jsonb;

alter table public.client_meeting_insights rename column open_items to open_items_old;
alter table public.client_meeting_insights rename column open_items_new to open_items;
