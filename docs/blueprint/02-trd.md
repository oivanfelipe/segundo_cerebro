# TRD — Documento de Requisitos Técnicos

## Stack
- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Backend**: Next.js API Routes (funções serverless), rodando na mesma aplicação Next.js
- **Banco de dados**: Supabase (Postgres gerenciado)
- **Hospedagem**: Vercel (app) + Supabase (banco de dados)
- **Versionamento**: GitHub

## Ferramentas e serviços externos
- **Google Drive API + Google Docs API** (`googleapis`) — leitura das pastas de reunião e dos documentos "Anotações do Gemini". Autenticação via **Service Account** do Google Cloud (sem OAuth pessoal, sem tela de login do Google), com escopos somente leitura (`drive.readonly`, `documents.readonly`). A pasta raiz do Drive precisa ser compartilhada com o e-mail da service account.
- **Groq API** (`llama-3.3-70b-versatile`) — geração do resumo da reunião e identificação de qual(is) cliente(s) da lista cadastrada foram mencionados, com extração de decisões e próximas etapas por cliente. Escolhido por ser rápido e barato o suficiente para o volume de uso pessoal.
- **Supabase** — banco de dados relacional (Postgres) para clientes, reuniões processadas, insights por cliente e compilado.

## Restrições técnicas
- **Sync é manual**, disparado por um botão "Sincronizar agora" no app (chama uma API route que varre o Drive). Não há cron automático na v1 — decisão explícita para simplificar a primeira versão; pode virar automático depois sem mudar a arquitetura de dados.
- **Sem autenticação/login na v1.** O app fica acessível por URL, sem tela de senha nem Supabase Auth. Aceito porque é uso pessoal — não deve ser compartilhado nem divulgado publicamente. Se isso mudar, adicionar proteção antes de expor a URL a qualquer outra pessoa.
- **Identificação de cliente é sempre por correspondência contra a lista cadastrada no banco** (tabela `clients`), nunca por extração livre de entidades — a lista de clientes conhecidos é enviada para a IA em todo processamento de reunião.
- **IA usada é Groq (llama-3.3-70b-versatile)** para resumo e identificação — decisão tomada nesta etapa de planejamento, não deve ser revertida sem discussão (ex: trocar para Claude/OpenAI é uma mudança de escopo, não um detalhe de implementação).
- **Idempotência obrigatória**: cada pasta/documento de reunião processado precisa ser registrado (tabela de controle) para nunca ser reprocessado numa sincronização futura.
- **Toda reunião é escaneada por conteúdo** (resumo + decisões + próximas etapas + transcrição bruta) — não existe filtro por nome de pasta ou tipo de reunião antes da análise por IA.

## Ambientes
- **Desenvolvimento**: local via `next dev`, apontando para um projeto Supabase (mesmo projeto de produção é aceitável dado uso individual — sem necessidade de ambiente de staging separado numa v1 pessoal).
- **Produção**: deploy no Vercel a partir da branch `main`, conectado ao projeto Supabase de produção.
- Variáveis de ambiente sensíveis (chave da service account do Google, API key da Groq, credenciais do Supabase) ficam configuradas no painel do Vercel, nunca commitadas no repositório.
