# Playbook WG - Reproducao de Modelo + Pesquisa Profunda do Cliente

## Principio

Quando o cliente escolhe um modelo visual, a entrega WG deve reproduzir a experiencia escolhida com fidelidade e substituir o conteudo por uma narrativa personalizada, fundamentada em pesquisa.

O diferencial nao e apenas "trocar texto". O diferencial e:

- entender a estrutura do modelo;
- identificar efeitos, imagens, videos, grid, fonte, botoes e ritmo visual;
- pesquisar profundamente o cliente e setor;
- transformar material publico em storytelling comercial;
- entregar algo personalizado, verificavel e melhor que um template preenchido.

## Fluxo obrigatorio

### Fase 1 - Acesso e licenca

- Registrar URL do modelo.
- Identificar se e:
  - template gratuito;
  - template pago;
  - projeto Framer privado;
  - site publico publicado;
  - referencia visual externa.
- Confirmar permissao de uso/remix/licenca.
- Se houver acesso Framer, preferir duplicar/remixar dentro do Framer.
- Se nao houver export oficial, reconstruir por auditoria visual e DOM.

### Fase 2 - Auditoria do modelo

Capturar e documentar:

- paginas;
- secoes;
- componentes;
- menus;
- CTAs;
- formularios;
- FAQs;
- cards;
- animacoes;
- videos;
- fotos;
- logos;
- fontes;
- cores;
- sombras;
- espaçamentos;
- comportamento responsive.

Saidas obrigatorias:

- `REFERENCIA-MODELO-AUDIT.md`;
- screenshots desktop/mobile;
- tabela `secao do modelo -> secao do cliente`;
- lista de assets necessarios.

### Fase 3 - Pesquisa do cliente

Pesquisar:

- LinkedIn;
- posts;
- portfolio;
- site atual;
- Google;
- YouTube;
- Instagram;
- podcasts/entrevistas;
- artigos;
- empresas associadas;
- concorrentes;
- mercado;
- dores do publico;
- termos tecnicos do setor.

Classificacao obrigatoria:

- fato verificavel;
- inferencia editorial;
- hipotese para validar;
- dado sensivel/proibido.

Saidas obrigatorias:

- `PESQUISA-WEB-CLIENTE.md`;
- `MAPA-SETOR-E-POSICIONAMENTO.md`;
- `BANCO-DE-STORYTELLING.md`;
- `PERGUNTAS-PENDENTES.md`.

### Fase 4 - Adaptacao bloco a bloco

Para cada secao do modelo:

- manter objetivo visual e comercial;
- adaptar conteudo para o cliente;
- substituir imagens/videos por assets reais ou curadoria adequada;
- manter hierarquia e ritmo do template;
- nao criar secoes aleatorias que descaracterizem o modelo escolhido.

### Fase 5 - Implementacao

Escolher caminho:

- Framer: duplicar/remixar e editar no canvas.
- Codigo proprio: reconstruir com HTML/CSS/JS, Next.js, Vite ou stack definida.

Em codigo proprio, nao tentar "copiar zip" sem controle. Recriar conscientemente:

- layout;
- breakpoints;
- efeitos;
- responsividade;
- acessibilidade;
- SEO;
- performance.

### Fase 6 - Validacao

Obrigatorio:

- modelo original desktop;
- cliente desktop;
- modelo original mobile;
- cliente mobile;
- comparativo visual;
- links e botoes;
- formulario;
- console;
- rede;
- imagens/videos;
- registro em `RETURN-POINT.md`.

## Sobre Framer e export de codigo

Framer nao fornece, como fluxo oficial, export completo de um projeto para codigo HTML/CSS/JS editavel e self-hosted. O caminho oficial para manter fidelidade e editar dentro do Framer via remix/duplicacao. Para codigo proprio, a fidelidade vem de auditoria visual, DOM, CSS computado e reconstrucao manual.

Ferramentas de terceiros de export devem ser tratadas como excecao, com risco tecnico e licenciamento validado antes.

## Criterio de excelencia WG

Uma entrega so deve ser chamada de excelente quando:

- o modelo escolhido e reconhecivel;
- o conteudo nao parece template;
- o setor do cliente esta evidente;
- a narrativa usa material real e pesquisa;
- os assets sao coerentes;
- desktop e mobile foram validados;
- ha registro de fontes, pendencias e decisoes;
- o cliente recebe algo que parece feito para ele, nao apenas preenchido.

## Resultado alvo aprovado

Para projetos em que o usuario pedir reproducao fiel de modelo, o resultado esperado e este:

- o modelo escolhido continua reconhecivel em estrutura, ritmo, cards, fontes, videos, botoes, header, espacamentos e responsividade;
- o conteudo do cliente entra recapsulado nos blocos do modelo, sem inventar outra arquitetura;
- hero usa video/imagem forte, overlay e header sobreposto;
- header original preserva posicao de logo/nome;
- quando header precisar acompanhar a rolagem, o proprio header fica fixo/sticky;
- menu e seletor de idiomas acompanham a rolagem junto com logo/nome;
- nao criar marca duplicada para rolagem;
- CTAs flutuantes usam transparencia/blur, sem borda pesada;
- video de fundo mobile deve iniciar automaticamente, sem controles e sem icone de play manual;
- menu sanduiche mobile abre alinhado abaixo do header, nao no meio da tela;
- cada acabamento pedido por print vira ajuste cirurgico, validacao visual e registro.

## Checklist curto para chegar no resultado aprovado

Use este checklist antes de enviar ao cliente:

- [ ] URL do modelo registrada e permissao/licenca mapeada.
- [ ] Preview publico ou fonte visual auditada em desktop e mobile.
- [ ] Prints do modelo separados por blocos, com hero como `Bloco 1`.
- [ ] Tabela `bloco do modelo -> bloco do cliente` criada.
- [ ] Assets do cliente copiados para `assets` e aplicados apenas nos locais definidos.
- [ ] Logo/nome no mesmo local visual do modelo original.
- [ ] Header original fixo/sticky quando houver efeito de rolagem.
- [ ] Menu do header acompanha rolagem.
- [ ] Seletor de idiomas acompanha rolagem.
- [ ] Nenhuma marca duplicada criada para simular rolagem.
- [ ] CTA duplicado de header removido quando competir com CTA flutuante.
- [ ] CTA flutuante validado com `position=fixed`, `borderWidth=0px`, transparencia/blur e contraste.
- [ ] Videos de fundo com `autoplay`, `muted`, `loop`, `playsinline`, `webkit-playsinline`, `preload=auto`.
- [ ] JS reforca autoplay mobile sem controles: `muted`, `defaultMuted`, `playsInline`, `play()` em load/toque/scroll.
- [ ] Videos decorativos com `pointer-events:none` e sem aparencia de player manual.
- [ ] Menu sanduiche mobile abre abaixo do header, largura correta, sem aparecer no meio da pagina.
- [ ] Textos longos ajustados por largura, escala e copy para evitar quebras ruins.
- [ ] Duplicidades abaixo de pilulas removidas quando o marcador principal ja comunica a secao.
- [ ] Cards, overlays, tags, icones, metricas e logos conferidos contra prints.
- [ ] Desktop validado por screenshot full-page.
- [ ] Mobile validado por screenshot full-page.
- [ ] Smoke headless validou menu, FAQ, header em scroll, CTA, videos e console sem erros.
- [ ] Depoimentos ficticios e marcas/credenciais marcados como pendentes de aprovacao real.
- [ ] `RETURN-POINT.md` atualizado com evidencias e pendencias.
- [ ] Tunel publico testado com HTTP `200` antes de enviar ao cliente.

## Manual operacional por prints numerados

Quando o cliente enviar prints do modelo separados por blocos, organizar a execucao assim:

1. Criar uma pasta de referencia no projeto e registrar a pasta original dos prints do cliente.
2. Tratar o hero como `Bloco 1`, mesmo quando o cliente chamar de pagina 1.
3. Nomear cada print como `bloco-01-hero`, `bloco-02-quem-somos`, `bloco-03-servicos`, etc., ou manter o nome original e criar um mapa no `RETURN-POINT.md`.
4. Para cada bloco, registrar:
   - objetivo visual;
   - ordem na pagina;
   - layout desktop;
   - layout mobile;
   - tipo de asset usado;
   - efeitos visiveis;
   - texto original do modelo;
   - texto recapsulado do cliente;
   - status `pendente`, `parcial` ou `validado`.
5. Antes de editar, comparar a pagina atual com os prints e listar ajustes concretos:
   - escala de fonte;
   - card/grid;
   - proporcao de imagem/video;
   - pílulas, tags e botoes;
   - overlays;
   - respiro vertical;
   - alinhamento mobile.
6. Implementar bloco por bloco mantendo a arquitetura do modelo escolhido.
7. Rodar validacao visual desktop e mobile.
8. Abrir os screenshots gerados e corrigir detalhes visuais que so aparecem renderizados.
9. Registrar evidencias no `RETURN-POINT.md`.
10. Atualizar este playbook quando o projeto revelar um novo padrao reutilizavel.

## Padrao de recapsulamento aplicado no caso Felipe Carvalho

Exemplo de organizacao de pedido complexo:

- Pedido do cliente:
  - reproduzir o modelo Framer escolhido;
  - usar logo/foto recebidos;
  - pesquisar LinkedIn e materiais publicos;
  - preservar videos, efeitos, cards, botoes, layout e storytelling do template;
  - substituir conteudo por narrativa do cliente;
  - validar visualmente e documentar para proximos projetos.
- Organizacao feita:
  - projeto criado com briefing, referencias, site estatico e `RETURN-POINT.md`;
  - assets recebidos movidos para `04_SITE/assets`;
  - logo recortado e foto aplicada apenas quando o usuario indicou o local;
  - modelo Stratwell auditado via preview publico, screenshots, HTML publicado e assets baixados;
  - pesquisa publica do cliente separada entre fatos, inferencias e pendencias de validacao;
  - site reconstruido em blocos equivalentes ao template;
  - prints do usuario usados como ordem visual de ajuste fino.
- Execucao por blocos:
  - Bloco 1: hero com video, header, idioma visual, avatar e CTA.
  - Bloco 2: texto editorial `Quem Somos` + metricas animadas.
  - Bloco 3: cards de servicos 2x2 + imagem grande + card CTA.
  - Bloco 4: case grande com tags e overlay.
  - Bloco 5: objetivo em card editorial + imagem.
  - Bloco 6: metodo com texto grande, midia e cards numerados.
  - Testemunhos: cards ficticios apenas para validacao visual.
  - Logos: grid visual com credenciais pendentes de permissao.
  - CTA final: video + card glass.

## Regra para textos que quebram layout

Quando um texto personalizado quebrar o desenho do template:

- primeiro reduzir levemente a escala tipografica via `clamp`, sem trocar a hierarquia;
- depois encurtar a copy mantendo a mesma promessa comercial;
- ajustar largura maxima do bloco antes de mudar layout;
- no mobile, priorizar leitura e evitar frases longas em botoes ou cards;
- nunca declarar validado sem screenshot renderizado de desktop e mobile.

## Regra de acabamento e aprovacao visual

Nos acabamentos finais, seguir exatamente a intencao do cliente, mesmo quando o ajuste parecer pequeno. Esta fase nao e redesign; e lapidacao.

Ordem recomendada:

1. Receber prints de ajuste fino em pasta unica do projeto.
2. Ordenar por data e identificar o print novo antes de editar.
3. Classificar o pedido:
   - texto quebrando;
   - duplicidade visual;
   - posicao de logo/nome;
   - CTA;
   - menu/header;
   - efeito de rolagem;
   - card/imagem;
   - responsivo.
4. Aplicar somente o ajuste indicado, sem mexer em blocos ja aprovados.
5. Rodar screenshot desktop/mobile.
6. Fazer smoke headless quando houver interacao, scroll, menu, FAQ, imagem ou video.
7. Registrar no `RETURN-POINT.md`:
   - print recebido;
   - ajuste aplicado;
   - regra aprendida;
   - evidencias desktop/mobile;
   - pendencias reais de publicacao.

## Regra de header, logo e rolagem

Quando o modelo original tem logo/nome, menu e seletor de idioma no header:

- nao criar uma segunda marca flutuante para simular o header em rolagem;
- manter logo e nome no mesmo local visual do modelo original;
- se o cliente pedir que "rode junto", tornar o proprio header original fixo/sticky;
- aplicar o efeito de rolagem no conjunto inteiro:
  - logo;
  - nome;
  - menu;
  - seletor de idiomas;
  - elementos auxiliares do header.
- em rolagem, usar transparencia/blur para leitura, evitando caixa branca solida quando o modelo pede leveza;
- validar tecnicamente `position`, `top`, `left`, textos do menu e textos do seletor.

Exemplo validado no projeto Felipe:

- `.site-header.position=fixed`;
- marca no header: `Felipe Carvalho`;
- menu acompanha rolagem:
  - `Home`;
  - `Serviços`;
  - `Sobre`;
  - `Cases`;
  - `FAQs`;
- idiomas acompanham rolagem:
  - `PT`;
  - `EN`;
  - `ES`;
  - `ZH`.

## Regra de CTAs flutuantes

Quando o cliente pedir CTAs flutuantes com transparencia:

- manter apenas os CTAs necessarios; remover CTA duplicado de header quando ele competir com o flutuante;
- usar `position: fixed` para o CTA que deve acompanhar a rolagem;
- usar fundo translucido com blur, sem borda pesada;
- validar:
  - `position=fixed`;
  - `borderWidth=0px`;
  - contraste suficiente em hero escuro e secoes claras;
  - ausencia de sobreposicao com conteudo importante em desktop/mobile.

## Regra de videos decorativos no mobile

Videos usados como background/ambiencia nao devem parecer player manual no celular.

Obrigatorio:

- HTML:
  - `autoplay`;
  - `muted`;
  - `loop`;
  - `playsinline`;
  - `webkit-playsinline`;
  - `preload=auto`;
  - sem `controls`.
- CSS:
  - `pointer-events:none` para videos decorativos.
- JS:
  - reforcar `muted=true`;
  - reforcar `defaultMuted=true`;
  - reforcar `playsInline=true`;
  - remover `controls`;
  - tentar `play()` em `load`;
  - repetir tentativa em `touchstart`, `pointerdown` e `scroll`.
- Validacao:
  - `paused=false`;
  - `controls=false`;
  - `playsInline=true`;
  - `muted=true`;
  - `readyState >= 2`.

## Regra de menu sanduiche mobile

O menu mobile deve abrir como extensao do header, nunca no meio da pagina.

Validar:

- `position=fixed` ou `absolute` dentro do contexto correto do header;
- top logo abaixo do header;
- margens laterais coerentes;
- largura ocupando a area util, nao apenas a largura do conteudo;
- `z-index` acima do conteudo;
- fechamento ao clicar nos links;
- texto legivel e sem sobreposicao com hero/cards.

## Regra de tunel para aprovacao do cliente

Antes de enviar link publico temporario:

- confirmar que o servidor local responde `200`;
- rodar auditoria visual desktop/mobile mais recente;
- garantir que assets principais carregam;
- subir tunel com log salvo no projeto;
- testar o link publico com HTTP `200`;
- registrar no `RETURN-POINT.md`:
  - ferramenta de tunel;
  - porta local;
  - URL publica;
  - data/hora;
  - observacao de que e link temporario;
  - pendencias antes de publicacao final.

Link de tunel e para aprovacao visual, nao substitui deploy final.

## Regra de recapsulamento de template

Quando o usuario pedir para seguir um modelo especifico, o fluxo correto e:

- manter a estrutura de apresentacao do modelo;
- manter o ritmo visual, proporcoes, efeitos, videos, cards, botoes e hierarquia;
- substituir apenas a "casca de conteudo": nome, logo, copy, servicos, cases, links e narrativa;
- usar foto do cliente somente quando houver indicacao clara de posicao/crop;
- nao trocar a experiencia por outro layout "bonito";
- nao remover video se o modelo usa video como sinal central;
- recapsular o conteudo do cliente dentro dos blocos do modelo, em vez de inventar uma nova arquitetura.

Para Framer:

- se houver API/key/remix, usar para inventario e edicao quando aplicavel;
- se nao houver key, usar preview publico + copia publicada + screenshots;
- registrar no projeto a diferenca entre:
  - `source visual` = preview publico;
  - `source tecnico` = HTML/assets publicados;
  - `source editavel` = projeto Framer com acesso/remix.
