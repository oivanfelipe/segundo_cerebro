# Segundo Cérebro

App pessoal que sincroniza transcrições de reunião do Google Drive, gera resumos por IA,
identifica quais clientes cadastrados foram mencionados em cada reunião e mantém um
compilado sempre atualizado de cada cliente (linha do tempo, decisões, pendências e
resumo geral acumulado).

Contexto completo de produto em `docs/blueprint/` (PRD, TRD, AppFlow, Design Brief,
Esquema de Backend, Plano de Implementação).

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres)
- Google Drive API + Google Docs API via OAuth (login com a conta Google do usuário)
- Groq (`llama-3.3-70b-versatile`) para resumo e identificação de cliente
- Deploy: Vercel

## Setup

1. **Supabase**: o projeto de produção (`task-chat`, compartilhado com outros apps
   pessoais) já foi migrado — ver `supabase/migrations/0002_adapt_task_chat_project.sql`.
   URL: `https://lbqmanwfgnhugjefluzy.supabase.co`. Para um projeto novo do zero, aplique
   `supabase/migrations/0001_init.sql`.
2. **Google Cloud**: crie um OAuth Client ID (tipo "Web application") no projeto que já
   tem Drive API e Docs API habilitadas. Configure a tela de consentimento OAuth (modo
   "External" + seu e-mail como test user, já que é uso pessoal) e adicione
   `<URL_DO_APP>/api/auth/google/callback` como redirect URI autorizado. Depois de
   configurar as variáveis de ambiente, acesse o Dashboard e clique em "Conectar
   Google" — isso troca a Service Account (bloqueada pelo Workspace em arquivos não
   compartilhados explicitamente com ela) pelo seu próprio acesso ao Drive.
3. **Groq**: gere uma API key em [console.groq.com](https://console.groq.com).
4. Copie `.env.example` para `.env.local` e preencha as variáveis.
5. `npm install && npm run dev`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do Supabase — **só no backend**, nunca exposta no client |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID do OAuth 2.0 (Google Cloud Console) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client secret do OAuth 2.0 |
| `GOOGLE_OAUTH_REDIRECT_URI` | `<URL_DO_APP>/api/auth/google/callback` — precisa bater exatamente com o redirect URI autorizado no Google Cloud |
| `GOOGLE_DRIVE_FOLDER_ID` | ID da pasta raiz do Drive onde as reuniões (subpastas) aparecem |
| `GROQ_API_KEY` | API key da Groq |

## Uso

Antes do primeiro sync, conecte sua conta Google pelo botão no Dashboard (fica visível
sempre que a conexão expira ou nunca foi feita). O refresh token fica salvo no Supabase
(tabela `google_oauth_tokens`) e é renovado automaticamente pelo app.

O sync é manual (sem cron na v1): no Dashboard, clique em "Sincronizar agora" para
varrer a pasta do Drive em busca de reuniões novas, gerar os resumos e atualizar os
compilados dos clientes mencionados.

Não há autenticação de múltiplos usuários — o app é de uso individual e não deve ter
sua URL de produção divulgada. A conexão com o Google é por conta própria (OAuth), não
por login de terceiros no app.
