# Checklist WG - Aprovacao de Site por Modelo

Use este checklist para chegar direto ao resultado aprovado no projeto Felipe Carvalho.

## 1. Entrada

- [ ] URL do modelo recebida.
- [ ] Link editavel/remix/API verificado quando existir.
- [ ] Preview publico auditado quando nao houver acesso editavel.
- [ ] Prints do usuario salvos em pasta do projeto.
- [ ] Hero tratado como `Bloco 1`.
- [ ] Cada print mapeado para um bloco da pagina.

## 2. Reproducao do modelo

- [ ] Estrutura do modelo preservada.
- [ ] Hierarquia visual preservada.
- [ ] Tipografia editorial aplicada.
- [ ] Videos/imagens do modelo ou equivalentes aplicados.
- [ ] Cards, overlays, tags, pílulas e botoes reproduzidos.
- [ ] Layout desktop e mobile comparados com prints.

## 3. Conteudo do cliente

- [ ] Nome e logo aplicados.
- [ ] Foto aplicada somente no local indicado.
- [ ] Storytelling adaptado ao setor do cliente.
- [ ] Pesquisa separada entre fato, inferencia e pendencia.
- [ ] Depoimentos ficticios marcados como placeholder.
- [ ] Logos/credenciais marcados como dependentes de permissao.

## 4. Acabamento visual

- [ ] Textos grandes sem quebras ruins ou palavras isoladas.
- [ ] Titulos que devem ficar em uma linha validados no desktop.
- [ ] Duplicidades abaixo de pílulas removidas.
- [ ] Cards com altura, espacamento e simetria coerentes.
- [ ] Imagens/videos com crop correto em desktop.
- [ ] Imagens/videos com crop correto em mobile.
- [ ] CTA final com video/imagem forte e card translucido quando o modelo pedir.

## 5. Header e rolagem

- [ ] Logo e nome permanecem no mesmo local visual do modelo.
- [ ] Nao existe marca duplicada para simular header.
- [ ] O proprio header original acompanha a rolagem quando solicitado.
- [ ] Menu acompanha a rolagem.
- [ ] Seletor de idiomas acompanha a rolagem.
- [ ] Header nao usa fundo branco solido se o modelo pede transparencia.
- [ ] Contraste em rolagem validado em secoes claras e escuras.

## 6. CTAs

- [ ] CTA duplicado no header removido quando competir com CTA flutuante.
- [ ] CTA flutuante usa `position: fixed`.
- [ ] CTA flutuante usa transparencia/blur.
- [ ] CTA flutuante tem `borderWidth=0px`.
- [ ] CTA flutuante nao cobre conteudo importante.

## 7. Videos mobile

- [ ] Videos decorativos tem `autoplay`.
- [ ] Videos decorativos tem `muted`.
- [ ] Videos decorativos tem `loop`.
- [ ] Videos decorativos tem `playsinline`.
- [ ] Videos decorativos tem `webkit-playsinline`.
- [ ] Videos decorativos tem `preload=auto`.
- [ ] Videos decorativos nao tem `controls`.
- [ ] CSS usa `pointer-events:none` em videos decorativos.
- [ ] JS tenta `play()` em load, toque, pointer e scroll.
- [ ] Validado no mobile/headless:
  - [ ] `paused=false`;
  - [ ] `controls=false`;
  - [ ] `playsInline=true`;
  - [ ] `muted=true`;
  - [ ] `readyState >= 2`.

## 8. Menu mobile

- [ ] Botao sanduiche abre menu.
- [ ] Menu abre abaixo do header.
- [ ] Menu nao abre no meio da tela.
- [ ] Menu ocupa a largura correta entre margens laterais.
- [ ] Menu fecha ao clicar em link.
- [ ] Menu nao sobrepoe o CTA de forma incoerente.

## 9. Validacao

- [ ] HTTP local `200`.
- [ ] Screenshot desktop full-page gerado.
- [ ] Screenshot mobile full-page gerado.
- [ ] Smoke de menu executado.
- [ ] Smoke de FAQ executado.
- [ ] Smoke de header em scroll executado.
- [ ] Smoke de CTA executado.
- [ ] Smoke de videos executado.
- [ ] Console sem erros relevantes.
- [ ] Assets principais carregados.

## 10. Envio para cliente

- [ ] `RETURN-POINT.md` atualizado.
- [ ] Pendencias reais registradas.
- [ ] Tunel iniciado somente apos validacao local.
- [ ] URL publica respondeu `200`.
- [ ] Screenshot desktop do tunel gerado.
- [ ] Screenshot mobile do tunel gerado.
- [ ] Cliente informado de que tunel e temporario e nao e deploy final.
