-- Troca a Service Account (bloqueada pelo Workspace em arquivos não compartilhados
-- explicitamente com ela) por OAuth do usuário: ele loga uma vez com a própria conta
-- Google e o app passa a ler o Drive/Docs com o acesso real dele, sem restrição de
-- domínio. Linha única (id fixo = 1) guarda o refresh_token.

create table if not exists public.google_oauth_tokens (
  id int primary key default 1,
  access_token text,
  refresh_token text,
  expiry_date timestamptz,
  updated_at timestamptz not null default now(),
  constraint google_oauth_tokens_singleton check (id = 1)
);

alter table public.google_oauth_tokens enable row level security;
