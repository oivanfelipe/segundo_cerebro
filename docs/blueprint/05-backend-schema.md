# Esquema de Backend

## Fluxo de autenticação
Não há autenticação na v1 (decisão tomada no TRD: app de uso individual, protegido só por não ter a URL divulgada). Não existe tabela de usuários nem login — todas as tabelas abaixo pertencem implicitamente a um único usuário/dono do app.

## Tabelas

### clients
Lista de referência dos clientes — usada tanto para exibir o compilado quanto como lista conhecida enviada à IA para identificação nas reuniões.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid (PK) | Identificador do cliente |
| name | text | Nome do cliente (usado no match contra o conteúdo das reuniões) |
| contact | text, nullable | Contato principal (nome/e-mail/telefone) |
| segment | text, nullable | Segmento/nicho do cliente |
| status | text | `active` \| `paused` — só clientes `active` entram na lista enviada à IA |
| accumulated_summary | text, nullable | Resumo geral acumulado e vivo do cliente (reescrito a cada nova reunião relevante) |
| accumulated_summary_updated_at | timestamp, nullable | Quando o resumo acumulado foi atualizado pela última vez |
| created_at | timestamp | Data de cadastro |
| updated_at | timestamp | Última edição do cadastro |

### processed_docs
Controle de idempotência do sync — garante que a mesma pasta/reunião do Drive nunca seja reprocessada.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid (PK) | Identificador do registro |
| folder_id | text, unique | ID da pasta de reunião no Drive |
| folder_name | text | Nome da pasta (título original da reunião no Drive, com data/hora) |
| status | text | `processed` \| `no_transcript` \| `error` |
| error_message | text, nullable | Detalhe do erro, quando `status = error` |
| processed_at | timestamp | Quando o processamento ocorreu |

### meeting_summaries
Um registro por reunião processada com sucesso (documento "Anotações do Gemini" encontrado e lido).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid (PK) | Identificador da reunião |
| processed_doc_id | uuid (FK → processed_docs.id) | Vínculo com o controle de sync |
| doc_name | text | Nome do documento/pasta original |
| meeting_date | date, nullable | Data da reunião (extraída do nome da pasta ou do conteúdo) |
| overall_summary | text | Resumo geral da reunião (todos os assuntos, não só os de cliente) |
| participants | text, nullable | Lista de participantes |
| created_at | timestamp | Quando o resumo foi gerado |

### client_meeting_insights
O vínculo entre uma reunião e um cliente mencionado nela — a peça central da linha do tempo do compilado. Uma reunião pode gerar múltiplos registros aqui (um por cliente identificado).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid (PK) | Identificador do vínculo |
| meeting_summary_id | uuid (FK → meeting_summaries.id) | Reunião de origem |
| client_id | uuid (FK → clients.id), nullable | Cliente identificado (nullable até reatribuição manual, se a IA não identificou nenhum) |
| context_summary | text | Trecho do resumo específico a este cliente (não a reunião inteira) |
| key_decisions | text[] | Decisões relevantes a este cliente, extraídas da reunião |
| open_items | text[] | Pendências/próximas etapas relevantes a este cliente |
| assigned_by | text | `ai` \| `manual` — se o vínculo veio da identificação automática ou de correção manual do usuário |
| created_at | timestamp | Quando o vínculo foi criado |

## Relacionamentos
- Um **cliente** (`clients`) tem muitos **vínculos de reunião** (`client_meeting_insights`) — a linha do tempo do compilado é a lista desses vínculos ordenada por data da reunião.
- Uma **reunião processada** (`meeting_summaries`) tem muitos **vínculos de reunião** — um por cliente identificado nela (zero, um ou vários).
- Uma **reunião processada** pertence a um **registro de sync** (`processed_docs`) — relação 1:1, controla que aquela pasta do Drive não seja reprocessada.
- O **resumo acumulado** de um cliente (`clients.accumulated_summary`) é derivado/atualizado a partir de todos os `client_meeting_insights` associados a ele, não uma tabela separada — é reescrito pela IA sempre que um novo vínculo é criado ou reatribuído para aquele cliente.

## Regras de acesso aos dados
Não se aplica um modelo de permissões por perfil — há apenas um usuário (o dono do app) com acesso total de leitura e escrita a todas as tabelas. Ainda assim, a conexão ao Supabase deve usar a **service role key** apenas no backend (API routes), nunca exposta no client; se alguma leitura for feita direto do client-side no futuro, usar Row Level Security para bloquear acesso público, já que os dados incluem informações sensíveis de clientes de agência.
