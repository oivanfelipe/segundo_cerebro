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
- Google Drive API + Google Docs API via Service Account (leitura, somente leitura)
- Groq (`llama-3.3-70b-versatile`) para resumo e identificação de cliente
- Deploy: Vercel

## Setup

1. **Supabase**: o projeto de produção (`task-chat`, compartilhado com outros apps
   pessoais) já foi migrado — ver `supabase/migrations/0002_adapt_task_chat_project.sql`.
   URL: `https://lbqmanwfgnhugjefluzy.supabase.co`. Para um projeto novo do zero, aplique
   `supabase/migrations/0001_init.sql`.
2. **Google Cloud**: crie uma Service Account com acesso de leitura ao Drive API e ao
   Docs API. Compartilhe a pasta raiz de reuniões do Drive com o e-mail da service
   account.
3. **Groq**: gere uma API key em [console.groq.com](https://console.groq.com).
4. Copie `.env.example` para `.env.local` e preencha as variáveis.
5. `npm install && npm run dev`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do Supabase — **só no backend**, nunca exposta no client |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | E-mail da service account do Google Cloud |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Chave privada da service account (formato PEM, com `\n` escapado) |
| `GOOGLE_DRIVE_FOLDER_ID` | ID da pasta raiz do Drive onde as reuniões (subpastas) aparecem |
| `GROQ_API_KEY` | API key da Groq |

## Uso

O sync é manual (sem cron na v1): no Dashboard, clique em "Sincronizar agora" para
varrer a pasta do Drive em busca de reuniões novas, gerar os resumos e atualizar os
compilados dos clientes mencionados.

Não há autenticação — o app é de uso individual e não deve ter sua URL de produção
divulgada.
