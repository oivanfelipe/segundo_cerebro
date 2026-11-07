-- Integração com o Ekyte.
-- Workspace do Ekyte de cada cliente (id numérico de ekyte_list_workspaces).
alter table public.clients add column if not exists ekyte_workspace_id bigint;
alter table public.clients add column if not exists ekyte_workspace_name text;

-- Responsável (executor no Ekyte) e vínculo com a tarefa criada, nas tarefas manuais.
-- Nas pendências de reunião (open_items jsonb) os mesmos campos vivem dentro do objeto do item:
-- { text, done, done_at, assignee_id, assignee_name, ekyte_task_id, ekyte_sent_at }.
alter table public.manual_tasks add column if not exists assignee_id text;
alter table public.manual_tasks add column if not exists assignee_name text;
alter table public.manual_tasks add column if not exists ekyte_task_id bigint;
alter table public.manual_tasks add column if not exists ekyte_sent_at timestamptz;
