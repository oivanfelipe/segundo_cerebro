-- Registro do que foi de fato aplicado em produção (projeto Supabase "task-chat",
-- compartilhado com outros apps pessoais do usuário) para adaptar o schema antigo do
-- Segundo Cérebro ao novo formato, preservando os 28 clientes já cadastrados.
--
-- Diferente de 0001_init.sql (que cria as tabelas do zero para um projeto novo), esta
-- migration foi escrita para ALTER TABLE em cima do schema já existente. Aplicada via
-- Supabase MCP em 2026-09-29.

alter table public.clients
  add column if not exists accumulated_summary text,
  add column if not exists accumulated_summary_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists clients_name_key on public.clients (lower(name));

alter table public.processed_docs rename column doc_id to folder_id;
alter table public.processed_docs rename column doc_name to folder_name;
alter table public.processed_docs
  add column if not exists status text not null default 'processed'
    check (status in ('processed', 'no_transcript', 'error')),
  add column if not exists error_message text;
alter table public.processed_docs drop column if exists tasks_extracted;

alter table public.call_summaries rename to meeting_summaries;
alter table public.meeting_summaries rename column summary to overall_summary;
alter table public.meeting_summaries
  add column if not exists processed_doc_id uuid references public.processed_docs(id) on delete cascade;
alter table public.meeting_summaries drop column if exists doc_id;
alter table public.meeting_summaries drop column if exists key_points;
alter table public.meeting_summaries drop column if exists action_items_count;
alter table public.meeting_summaries drop column if exists client_ids;

alter table public.client_meeting_insights rename column call_summary_id to meeting_summary_id;
alter table public.client_meeting_insights rename column context to context_summary;
alter table public.client_meeting_insights
  add column if not exists assigned_by text not null default 'ai' check (assigned_by in ('ai', 'manual'));
alter table public.client_meeting_insights alter column context_summary set not null;
alter table public.client_meeting_insights drop column if exists doc_name;
alter table public.client_meeting_insights drop column if exists meeting_date;

-- fora do escopo do PRD v1 (0 linhas, sem uso no código novo)
drop table if exists public.tasks;
drop table if exists public.team_members;
drop table if exists public.client_notes;

-- segurança: habilita RLS nas tabelas do Segundo Cérebro (bloqueia anon/authenticated;
-- a service role key usada pelo backend ignora RLS por padrão no Supabase). As tabelas
-- `daily_items` e `settings` do mesmo projeto pertencem a outro app do usuário e
-- continuam com RLS desabilitado — fora do escopo desta migration.
alter table public.clients enable row level security;
alter table public.processed_docs enable row level security;
alter table public.meeting_summaries enable row level security;
alter table public.client_meeting_insights enable row level security;
