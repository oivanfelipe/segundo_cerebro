# PRD — Documento de Requisitos do Produto

## Resumo do app
Segundo Cérebro (reconstruído do zero) é um app pessoal que sincroniza automaticamente as transcrições de reuniões do Google Drive, gera resumos por IA, identifica quais clientes cadastrados foram mencionados em cada reunião e mantém um compilado sempre atualizado de cada cliente — para uso individual de um profissional de growth/marketing que atende múltiplas contas simultaneamente.

## Problema que resolve
Hoje as informações discutidas sobre cada cliente ficam espalhadas em dezenas de documentos de reunião soltos no Drive (reuniões dedicadas ao cliente, mas também comitês internos, all hands e dailies onde vários clientes são mencionados de passagem). Não existe uma visão consolidada, por cliente, do que já foi decidido, do que ficou pendente e do histórico de conversas — reconstituir isso hoje exige reler manualmente múltiplos documentos.

## Público-alvo
Uso individual do dono do produto (profissional de growth/marketing, ponto focal de contas em uma agência). Não há multiusuário — o app é pessoal, sem compartilhamento com outras pessoas.

## Contexto real de dados (validado na pasta de origem)
- As transcrições já chegam prontas em texto: cada reunião do Google Meet gera automaticamente uma pasta no Drive nomeada `<contexto/cliente> - <data/hora>`, contendo atalhos para a gravação e para o documento **"Anotações do Gemini"**.
- Esse documento já vem estruturado: participantes, **Resumo** (gerado pelo Gemini), **Decisões**, **Próximas etapas** (ações com responsável) e a **transcrição bruta completa**.
- **Uma reunião pode mencionar múltiplos clientes ao mesmo tempo**, inclusive reuniões que não são "de cliente" por nome (ex: um comitê interno de time pode discutir 5 contas diferentes na mesma call). Por isso a identificação de cliente não pode depender do nome da pasta — precisa analisar o conteúdo (resumo + decisões + próximas etapas + transcrição) de toda reunião.
- O usuário mantém uma lista fixa de clientes cadastrados (25 hoje: Official Time, PetTreats, GSC, Miyamura Engenharia, TB Rio Elevadores, Alice Salazar, Nagaura, Point Thermic, Argiplam, VS Med, Premium Gourmet, Viagem do Sonhos, Empório Mega 100, Trufer, Elevance, Touch, TradePro, FF Consultoria, Falcon Textil, Krioplast, Triattori, Maná Refeições, Hotel Sacrarium, Pakman Tecnologia, RLav) — a identificação de cliente é feita por correspondência (match) contra essa lista pré-cadastrada, não por extração livre de entidades.

## Funcionalidades da primeira versão
1. **Sync automático de transcrições via Google Drive** — o app monitora a pasta raiz do Drive e detecta novos documentos "Anotações do Gemini" (ou similares) conforme surgem, sem ação manual do usuário.
2. **Cadastro de clientes** — tela/tabela para o usuário manter a lista de clientes (nome + dados de contexto). Serve como a lista de referência para o matching.
3. **Resumo automático por reunião** — o app processa o conteúdo do documento (aproveitando o Resumo/Decisões/Próximas etapas já gerados pelo Gemini como insumo, complementando com IA própria onde necessário) e gera um resumo estruturado da reunião.
4. **Identificação automática de cliente(s) por reunião** — a IA varre o conteúdo completo da reunião e identifica todos os clientes da lista cadastrada mencionados nela (zero, um ou vários), extraindo o trecho relevante a cada cliente.
5. **Reatribuição manual de cliente** — quando a IA errar, não identificar ou identificar de forma incompleta, o usuário pode corrigir manualmente quais clientes uma reunião (ou trecho dela) pertence.
6. **Compilado por cliente**, atualizado a cada nova reunião em que ele é mencionado, contendo:
   - Linha do tempo de reuniões (data + resumo de cada uma)
   - Decisões e pendências consolidadas ao longo do tempo
   - Resumo geral acumulado (vivo, reescrito conforme surgem novas informações)
   - Dados de contexto do cliente (contato, segmento, status — preenchidos no cadastro)
7. **Listagem/visualização** — lista de clientes com acesso ao compilado de cada um, e lista de reuniões processadas.

## Fora do escopo da primeira versão
- Upload manual de transcrição (só entra o que cai automaticamente na pasta sincronizada do Drive).
- Transcrição de áudio/vídeo — o app assume que o texto já vem pronto (documento gerado pelo Gemini ou equivalente); não processa arquivos de áudio/vídeo puros.
- Multiusuário, login de terceiros, permissões de equipe, compartilhamento.
- Qualquer filtro de "reunião interna vs. reunião de cliente" — toda reunião é escaneada por conteúdo, já que reuniões internas também mencionam clientes.

## Critério de sucesso
Uma transcrição real (documento "Anotações do Gemini") cai na pasta do Drive → o app sincroniza automaticamente → gera o resumo da reunião → identifica corretamente o(s) cliente(s) da lista cadastrada mencionados → atualiza o compilado de cada cliente correspondente (linha do tempo, decisões/pendências, resumo acumulado) — tudo isso sem intervenção manual, exceto quando o usuário precisar corrigir pontualmente um cliente mal identificado.
