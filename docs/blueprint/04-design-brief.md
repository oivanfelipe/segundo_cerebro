# Design Brief — UI e UX

## Tom visual
Linguagem de **cartaz editorial contemporâneo transformada em produto digital** — não um SaaS genérico. Deve transmitir força, modernidade, precisão, contraste, energia, objetividade, impacto visual e personalidade própria. Combina estética **editorial + gráfica + digital + funcional**.

Composição **modular e assimétrica**: elementos não são todos centralizados; permite deslocamento, sobreposição, tamanhos diferentes e alinhamentos assimétricos entre componentes, para parecer *construída* e não apenas preenchida. A assimetria é controlada — nunca sacrifica usabilidade.

Prioridade, nessa ordem: **1) usabilidade, 2) hierarquia, 3) clareza, 4) identidade visual, 5) impacto.** A estética deve ser marcante sem prejudicar a experiência de uso.

**Evitar explicitamente**: gradientes, glassmorphism, blur excessivo, sombras difusas, excesso de border-radius, múltiplas cores, estética genérica de SaaS, excesso de elementos decorativos ou 3D, amarelo em excesso, aparência infantil, interfaces poluídas.

## Paleta de cores
Uso exclusivo de três cores:
- **Azul-marinho — `#0A1F44`** (estrutura principal, texto, blocos, bordas)
- **Branco — `#FFFFFF`** (estrutura principal, fundos, texto sobre azul)
- **Amarelo — `#FFC400`** (cor de destaque e ação — uso controlado, nunca indiscriminado)

Azul-marinho e branco formam a base estrutural da interface (mesmo papel que preto/branco tinham no direcionamento original). Amarelo é reservado para: CTAs/botão primário, elementos ativos (estado ativo de navegação, seleção), indicadores importantes (ex: cliente sem reunião identificada, pendência crítica), números de destaque em dados, notificações, estados relevantes/estratégicos. A presença do amarelo deve ser controlada para preservar seu poder de destaque — não decorar com ele.

## Tipografia
Sans-serif moderna, pesada e altamente legível, com pesos variados priorizados: **Black, ExtraBold, Bold, Medium, Regular**.

- Títulos: forte presença visual, alta escala, peso pesado (Black/ExtraBold); caixa alta quando reforçar impacto (ex: nomes de seção, headers de página).
- Números/dados de destaque (ex: quantidade de reuniões sincronizadas, contagem de pendências no compilado): escala grande, peso pesado — tratados como elemento gráfico, não só informativo.
- Corpo de texto (resumos, transcrições, listas): peso Regular/Medium, legibilidade em primeiro lugar.
- Hierarquia construída por escala + peso + espaçamento + contraste + posicionamento, não só por tamanho.

A tipografia funciona como elemento gráfico da interface, não apenas informação.

## Componentes e estilo
- **Cards/blocos**: elementos importantes da identidade, não containers neutros. Bordas fortes (1–2px), cantos retos ou levemente arredondados (nunca excesso de border-radius). Sombras **sólidas e deslocadas** (ex: `0 6px 0 #0A1F44`), não sombras suaves/difusas — profundidade gráfica, não realista. Um bloco branco ou amarelo pode ter uma "extensão" azul-marinho deslocada alguns pixels para baixo/direita.
- **Botão primário**: fundo amarelo, texto azul-marinho, alto contraste, borda ou sombra sólida definida.
- **Botão secundário**: fundo azul-marinho ou branco, texto contrastante, borda definida.
- Sem gradientes e sem efeitos sofisticados em botões — devem parecer parte do sistema gráfico, não componente genérico de biblioteca de UI.
- **Ícones**: minimalistas, geométricos, consistentes, espessura uniforme — lineares ou sólidos simples. Nada ilustrativo/decorativo em excesso.
- **Espaçamento**: sistema consistente em múltiplos de 4, 8, 12, 16, 24, 32, 48, 64. Mesmo com identidade forte, preservar respiro — equilíbrio entre impacto visual, clareza e usabilidade.
- **Bordas e profundidade**: bordas de 1–2px, cantos retos ou levemente arredondados. Sombras predominantemente sólidas (não difusas), funcionando como parte da identidade, não como efeito de realismo.

## Padrão por tipo de tela
- **Dashboard/Home**: números e indicadores (reuniões sincronizadas, pendências, clientes ativos) tratados como elementos gráficos de destaque — grande escala, peso pesado, amarelo usado para variações/indicadores prioritários (ex: "+3 reuniões novas"). Não devem parecer uma tabela simples.
- **Listas (Clientes, Reuniões)**: hierarquia tipográfica forte nos itens, blocos/cards com bordas definidas e sombra sólida, amarelo reservado para estado ativo/selecionado ou indicador de pendência (ex: reunião sem cliente identificado).
- **Compilado do Cliente**: tela central do produto — títulos com forte presença (nome do cliente em destaque, caixa alta), seções bem demarcadas em blocos (linha do tempo, decisões/pendências, resumo acumulado, dados de contexto), uso de amarelo pontual para destacar pendências em aberto.
- **Formulários (Cadastro de Cliente)**: campos com bordas definidas (1–2px), botão de ação primário em amarelo, clareza acima de tudo — layout ainda modular/assimétrico, mas sem sacrificar a usabilidade do preenchimento.
- **Navegação**: tipografia forte para categorias/seções, estado ativo marcado com amarelo, barra lateral, sublinhado, bloco de destaque ou inversão de contraste — nunca competindo visualmente com o conteúdo principal da tela.
- **Mobile/responsivo**: em telas menores, reduzir elementos decorativos e sobreposições, mas preservar hierarquia — títulos fortes e ações continuam com prioridade visual, a identidade não desaparece.
