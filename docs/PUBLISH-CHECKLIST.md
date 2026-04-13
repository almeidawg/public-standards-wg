# PUBLISH-CHECKLIST

Checklist obrigatorio antes de tornar qualquer repositorio publico.

## Tecnico

- `check:imports` passou
- `audit:consistency:strict` passou
- `build` passou
- CI esta verde

## Sanitizacao

- sem `.env`
- sem tokens ou segredos
- sem paths locais
- sem dados de cliente
- sem endpoints privados
- sem logs internos
- sem `RETURN-POINT.md`
- sem `backup`, `historico`, `__deprecated`

## Governanca

- repo classificado como `PUBLIC`
- branch protection ativa
- merge apenas via PR
- checks obrigatorios configurados

## Regra final

Se existir duvida sobre exposicao:

nao publicar ainda.
