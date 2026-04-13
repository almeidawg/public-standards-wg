# PUBLIC-STANDARDS-WG

Base sanitizada para virar repositorio publico de standards do ecossistema WG.

Objetivo:

- publicar apenas padroes reaproveitaveis
- nao expor dados, paths locais, clientes ou operacao interna
- servir como template para novos projetos e para onboarding de agentes/engenheiros

## Conteudo permitido neste pacote

- templates genericos de `AGENTS.md`
- checklist de publicacao
- politica generica de Git
- padroes de CI/CD sem segredos
- scripts genericos de qualidade ja sanitizados

## Conteudo proibido neste pacote

- `.env`, tokens, segredos, webhooks
- nomes de clientes
- caminhos `C:\\Users\\...`
- URLs privadas ou endpoints internos
- `RETURN-POINT.md`
- arquivos de historico, backup ou `_deprecated`
- valores comerciais internos

## Estrutura recomendada do repositorio publico

- `templates/`
- `docs/`
- `scripts/`

## Regra de extracao

Se um arquivo veio do workspace interno:

1. remover qualquer dado sensivel
2. remover paths locais
3. remover referencias a clientes e operacao
4. revisar se ainda faz sentido fora do contexto interno
5. so depois mover para repo publico
