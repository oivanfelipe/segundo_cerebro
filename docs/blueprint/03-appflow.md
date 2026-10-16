# AppFlow — Fluxo e Navegação do App

## Mapa de telas
- **Dashboard (Home)** — visão geral: botão "Sincronizar agora", resumo de reuniões processadas recentemente, atalho para a lista de clientes.
- **Lista de Clientes** — todos os clientes cadastrados, com busca, e acesso ao compilado de cada um.
- **Cadastro/Edição de Cliente** — formulário para adicionar um novo cliente ou editar dados de um existente (nome, contato, segmento, status).
- **Compilado do Cliente** — a tela central do produto: linha do tempo de reuniões, decisões e pendências consolidadas, resumo geral acumulado e dados de contexto do cliente.
- **Lista de Reuniões** — todas as reuniões já processadas pelo sync, com data, título original da pasta do Drive e cliente(s) identificado(s).
- **Detalhe da Reunião** — resumo gerado da reunião, lista de clientes identificados com o trecho relevante a cada um, e ação de reatribuir/corrigir cliente.

## Jornada principal
1. Usuário chega no **Dashboard** → clica em "Sincronizar agora" → app varre o Drive, processa as reuniões novas e mostra quantas foram sincronizadas.
2. Usuário vai para a **Lista de Clientes** → clica em um cliente → abre o **Compilado do Cliente**, já atualizado com as reuniões recém-processadas (linha do tempo, decisões/pendências, resumo acumulado).
3. Usuário lê o resumo geral acumulado para se atualizar rapidamente sobre o cliente antes de uma call, sem precisar reler transcrições antigas.

## Jornadas alternativas

**Cliente novo, sem histórico ainda**
1. Usuário vai em **Lista de Clientes** → "Adicionar cliente" → preenche nome (+ dados de contexto opcionais) → salva.
2. Cliente passa a existir na lista de referência usada pela IA na próxima sincronização.

**Reunião com cliente identificado errado (ou não identificado)**
1. Usuário vai na **Lista de Reuniões** → abre o **Detalhe da Reunião** → vê que a IA não achou nenhum cliente, ou achou o errado.
2. Usuário reatribui manualmente o(s) cliente(s) certo(s) para aquela reunião (ou trecho dela).
3. O **Compilado do Cliente** correto é atualizado imediatamente com essa reunião; se um cliente tinha sido associado por engano, a reunião sai do compilado dele.

**Reunião menciona vários clientes**
1. No **Detalhe da Reunião**, cada cliente identificado aparece com o trecho de resumo/decisões/próximas etapas específico a ele (não o texto inteiro da reunião repetido).
2. Cada cliente mencionado recebe sua entrada correspondente no respectivo compilado.

## Estados especiais
- **Sync em andamento**: botão "Sincronizar agora" mostra estado de carregando; usuário não consegue disparar um segundo sync em paralelo.
- **Sync sem novidades**: mensagem simples ("Nenhuma reunião nova encontrada") quando não há pastas novas no Drive desde a última sincronização.
- **Erro ao processar uma reunião específica**: a reunião aparece na Lista de Reuniões com status de erro (ex: documento vazio, falha na IA), sem travar o processamento das demais; usuário pode tentar reprocessar aquela reunião individualmente.
- **Reunião sem nenhum cliente identificado**: aparece na Lista de Reuniões com status "sem cliente identificado", disponível para reatribuição manual, mas não aparece em nenhum compilado até ser associada.
- **Cliente sem nenhuma reunião ainda**: Compilado do Cliente mostra estado vazio ("Nenhuma reunião registrada ainda para este cliente") em vez de seções em branco.
- **Nenhum cliente cadastrado ainda**: Lista de Clientes mostra estado vazio com call-to-action direto para "Adicionar cliente", já que sem isso o sync não tem contra o que comparar.
