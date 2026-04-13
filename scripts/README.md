# SCRIPTS

Esta pasta deve receber apenas scripts publicaveis.

Criterios:

- sem paths locais
- sem nomes internos de infraestrutura
- sem segredos
- sem dependencia de estrutura privada do workspace

Scripts candidatos a extracao futura:

- `check-imports`
- `audit-consistency`
- `run-audit-all`

Antes de extrair qualquer script:

1. remover paths absolutos
2. parametrizar nomes de projetos
3. remover referencias a produtos internos
4. validar funcionamento em ambiente generico
