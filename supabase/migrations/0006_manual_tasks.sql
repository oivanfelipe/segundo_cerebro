-- Tarefas lançadas à mão (as pendências das reuniões continuam em client_meeting_insights.open_items).
create table if not exists public.manual_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_id uuid references public.clients(id) on delete set null,
  task_date date not null default current_date,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists manual_tasks_open_idx on public.manual_tasks (done, task_date desc);
create index if not exists manual_tasks_client_idx on public.manual_tasks (client_id);
alter table public.manual_tasks enable row level security;
