-- Responsáveis por cliente (origem: aba "Clientes ativos" da Torre de Controle).
-- A coluna `segment` deixa de ser usada pelo app, mas é mantida para não perder o histórico.
alter table public.clients add column if not exists account_manager text;
alter table public.clients add column if not exists social_media text;
alter table public.clients add column if not exists traffic_manager text;
alter table public.clients add column if not exists designer text;
