# Plano de Implementação

## Sequência de construção

1. **Setup do projeto** — Next.js 14 + TypeScript, repositório no GitHub, deploy inicial (mesmo vazio) no Vercel. Vem primeiro para validar cedo que o pipeline de deploy funciona, antes de acumular código em cima dele.

2. **Banco de dados** — criar projeto Supabase e aplicar o schema completo (`clients`, `processed_docs`, `meeting_summaries`, `client_meeting_insights`). Precisa existir antes de qualquer tela ou API que leia/grave dados.

3. **Design system base** — implementar os tokens visuais definidos no Design Brief (cores azul-marinho/branco/amarelo, tipografia, espaçamento, sombra sólida deslocada) e os componentes reutilizáveis (botão primário/secundário, card com bordas fortes). Vem antes das telas para que cada uma já nasça com a identidade visual certa, em vez de retrabalho de estilo depois.

4. **Cadastro de clientes** — tela de Lista de Clientes + Cadastro/Edição + API CRUD sobre a tabela `clients`. Precisa vir antes do sync, já que a lista de clientes é o que a IA usa como referência para identificação — sem isso, não há contra o que comparar.

5. **Integração com Google Drive** — configurar a service account, compartilhar a pasta raiz com ela, e implementar a leitura de pastas de reunião + resolução de atalhos + leitura do conteúdo do documento "Anotações do Gemini". Testar isoladamente (sem IA ainda) contra a pasta real, confirmando que o texto é lido corretamente.

6. **Integração com Groq (resumo + identificação de cliente)** — implementar a chamada que recebe o conteúdo da reunião + a lista de clientes cadastrados e devolve resumo geral, clientes identificados (múltiplos por reunião), decisões e pendências por cliente. Testar isoladamente com o texto de uma reunião real já conhecida antes de plugar no pipeline completo.

7. **Pipeline de sync manual completo** — juntar as etapas 5 e 6: botão "Sincronizar agora" que varre pastas novas do Drive, processa cada uma, grava em `processed_docs`, `meeting_summaries` e `client_meeting_insights`, com idempotência (nunca reprocessar a mesma pasta).

8. **Compilado do Cliente** — tela que agrega os `client_meeting_insights` de um cliente em linha do tempo, lista de decisões/pendências consolidadas, e a lógica que gera/atualiza o `accumulated_summary` sempre que um novo vínculo é criado para aquele cliente.

9. **Lista de Reuniões + Detalhe da Reunião** — tela com todas as reuniões processadas (status, clientes identificados) e a ação de reatribuição manual de cliente, que atualiza `client_meeting_insights` e dispara a atualização do compilado correspondente.

10. **Dashboard/Home** — última etapa, já que depende de todas as anteriores existirem para agregar números reais (reuniões sincronizadas, pendências, clientes ativos) como elementos visuais de destaque.

## Marcos de validação
- **Depois da etapa 2**: confirmar o schema rodando queries manuais no Supabase (inserir um cliente de teste, checar relacionamentos).
- **Depois da etapa 5**: confirmar que o app lê corretamente o conteúdo de uma reunião real do Drive (usar uma pasta já conhecida, como a de "Comitê FALCON" ou "Makeplas") antes de gastar chamadas de IA em cima disso.
- **Depois da etapa 6**: validar manualmente, com uma reunião real que menciona múltiplos clientes (ex: aquela que discutiu GSC, Drogalis, Alice, Minha Mura na mesma call), se a IA identifica corretamente todos eles — não seguir para a etapa 7 sem essa validação, já que é o ponto mais arriscado do produto.
- **Depois da etapa 7**: rodar o sync completo contra a pasta real do Drive e conferir manualmente se os registros em `client_meeting_insights` e o estado dos compilados batem com o que se esperava.
- **Antes de considerar a v1 pronta**: reproduzir o critério de sucesso do PRD — reunião real cai no Drive → sync manual → resumo → cliente(s) certo(s) identificado(s) → compilado atualizado, sem intervenção além de eventual correção pontual.

## Riscos e dependências
- **Acesso à pasta do Drive**: a pasta raiz precisa estar compartilhada com o e-mail da service account antes de qualquer teste da etapa 5 — bloqueador simples de esquecer.
- **Variação de nomes de cliente no texto**: nomes na lista cadastrada podem não bater exatamente com como aparecem nas reuniões (ex: "Falcon Textil" cadastrado vs. "Falcon Têxtil" na pasta) — pode exigir ajuste no prompt de identificação ou numa etapa de normalização depois dos primeiros testes reais com dados de produção.
- **Tamanho das transcrições**: reuniões de 1h+ geram documentos grandes (a reunião testada durante o planejamento tinha ~164 mil caracteres); confirmar que o modelo da Groq processa o conteúdo completo sem truncar informação relevante, especialmente decisões perto do fim da reunião.
- **Reunião sem cliente identificado**: não deve travar o pipeline — já coberto no AppFlow (fica com `client_id` nulo, disponível para reatribuição manual), mas a lógica de gravação em `client_meeting_insights` precisa lidar com esse caso desde a etapa 7.
- **Sem autenticação**: não é um risco técnico, mas um lembrete operacional — a URL de produção não deve ser divulgada nem indexada, já que não há proteção de acesso.
