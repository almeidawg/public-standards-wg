# GIT-VISIBILITY-POLICY

## Public

Use for:

- marketing websites
- generic templates
- reusable standards
- generic CI/CD examples

Requirements:

- sanitized content only
- branch protection enabled
- no sensitive business logic

## Private-Core

Use for:

- SaaS products
- admin panels
- billing, auth and webhook flows
- internal operational systems

Requirements:

- strict audit
- build required
- local pre-push hook if remote protection is unavailable

## Private-Operations

Use for:

- internal scripts
- history
- backups
- migration notes
- operational docs

Rule:

- do not publish

## Private-Client

Use for:

- client deliverables
- homologation
- approval environments

Rule:

- do not publish
