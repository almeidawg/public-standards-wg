# SCRIPTS

Esta pasta deve receber apenas scripts publicaveis.

Criterios:

- sem paths locais
- sem nomes internos de infraestrutura
- sem segredos
- sem dependencia de estrutura privada do workspace

Scripts ja extraidos e publicados, seguindo os criterios abaixo:

- `check-imports` / `audit-consistency` / `run-audit-all` (raiz de `scripts/`)
- `agent-coordination/` (`session-claim.mjs`, `agent-handoff.mjs`) - ver README da subpasta
- `schema-usage-guard/` (`schema-usage-guard.mjs`) - ver README da subpasta

Antes de extrair qualquer script novo:

1. remover paths absolutos
2. parametrizar nomes de projetos
3. remover referencias a produtos internos
4. validar funcionamento em ambiente generico
