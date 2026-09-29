-- Segundo Cérebro — schema inicial (rebuild)
-- Ver 05-backend-schema.md para a documentação completa de cada tabela.

create extension if not exists "pgcrypto";

-- clients ---------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  segment text,
  status text not null default 'active' check (status in ('active', 'paused')),
  accumulated_summary text,
  accumulated_summary_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clients_name_key on clients (lower(name));

-- processed_docs ----------------------------------------------------------
create table if not exists processed_docs (
  id uuid primary key default gen_random_uuid(),
  folder_id text not null unique,
  folder_name text not null,
  status text not null check (status in ('processed', 'no_transcript', 'error')),
  error_message text,
  processed_at timestamptz not null default now()
);

-- meeting_summaries -------------------------------------------------------
create table if not exists meeting_summaries (
  id uuid primary key default gen_random_uuid(),
  processed_doc_id uuid not null references processed_docs(id) on delete cascade,
  doc_name text not null,
  meeting_date date,
  overall_summary text not null,
  participants text,
  created_at timestamptz not null default now()
);

create index if not exists meeting_summaries_processed_doc_id_idx
  on meeting_summaries (processed_doc_id);

-- client_meeting_insights --------------------------------------------------
create table if not exists client_meeting_insights (
  id uuid primary key default gen_random_uuid(),
  meeting_summary_id uuid not null references meeting_summaries(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  context_summary text not null,
  key_decisions text[] not null default '{}',
  open_items text[] not null default '{}',
  assigned_by text not null default 'ai' check (assigned_by in ('ai', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists client_meeting_insights_client_id_idx
  on client_meeting_insights (client_id);
create index if not exists client_meeting_insights_meeting_summary_id_idx
  on client_meeting_insights (meeting_summary_id);
