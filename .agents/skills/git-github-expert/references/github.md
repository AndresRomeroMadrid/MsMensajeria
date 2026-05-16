# GitHub — Pull Requests, Actions, Releases y Automatización

## Pull Requests — Mejores Prácticas

### Crear un PR Efectivo

```markdown
# Título: sigue Conventional Commits
feat(checkout): add coupon code validation

# Template de descripción de PR (.github/pull_request_template.md):
## ¿Qué hace este PR?
<!-- Descripción clara de los cambios. Si es complejo, incluye un diagrama o screenshot -->

## Tipo de cambio
- [ ] Nueva feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Solo documentación

## ¿Cómo probarlo?
<!-- Pasos específicos para verificar que funciona correctamente -->
1. Ir a `/checkout`
2. Agregar un producto al carrito
3. Ingresar el código `SAVE10`
4. Verificar que el descuento se aplica correctamente

## Screenshots (si aplica)
<!-- Antes y después para cambios de UI -->

## Checklist
- [ ] Tests añadidos/actualizados
- [ ] Documentación actualizada
- [ ] No introduce cambios breaking sin estar documentado
- [ ] Self-review realizado

Closes #123  <!-- Cierra el issue automáticamente al mergear -->
```

### Code Review — Cómo Dar y Recibir Feedback

```markdown
# Como reviewer — tipos de comentarios:
# - Blocking (requiere cambio): "Este approach tiene un bug en el edge case X..."
# - Non-blocking (sugerencia): "nit: podrías simplificar esto con Array.find()"
# - Question: "¿Por qué usas X en lugar de Y aquí?"

# Prefijos útiles en comentarios:
# nit: → nitpick, no blocking
# suggestion: → sugerencia, no obligatoria
# question: → pregunta, sin cambio requerido
# blocking: → debe resolverse antes del merge
# FYI: → informacional

# En GitHub:
# - "Comment" → comentario sin aprobación/rechazo
# - "Approve" → aprobación (merge puede proceder)
# - "Request changes" → bloquea el merge hasta que se resuelvan

# Reviewer, responde a todos los comentarios:
# - Resolved: cuando el cambio se implementó
# - Won't fix with explanation: cuando no estás de acuerdo, explicar por qué
```

---

## GitHub Actions — CI/CD Completo

### Workflow de CI para un Proyecto TypeScript/Node

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true   # cancelar ejecuciones anteriores del mismo PR

env:
  NODE_VERSION: '20'

jobs:
  lint-and-type-check:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    name: Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint-and-type-check, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 1
```

### Workflow de Release Automático

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: write
  packages: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0      # necesario para el changelog completo

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
      - run: npm run build
      - run: npm run test

      # Generar el changelog desde los commits
      - name: Generate changelog
        id: changelog
        uses: orhun/git-cliff-action@v3
        with:
          config: cliff.toml
          args: --latest --strip header

      # Crear el GitHub Release
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: ${{ steps.changelog.outputs.content }}
          files: |
            dist/**/*
          generate_release_notes: false

      # Publicar en npm (si es un paquete)
      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Secrets y Variables de Entorno en Actions

```yaml
# Usar secrets (encrypted)
env:
  API_KEY: ${{ secrets.API_KEY }}
  DATABASE_URL: ${{ secrets.DATABASE_URL }}

# Usar variables (no encrypted, para configuración)
env:
  NODE_ENV: ${{ vars.NODE_ENV }}
  API_URL: ${{ vars.API_URL }}

# Secrets de entorno específico (staging, production)
jobs:
  deploy:
    environment: production   # usa los secrets del environment "production"
    steps:
      - run: deploy
        env:
          PROD_API_KEY: ${{ secrets.API_KEY }}  # el secret del environment production

# Crear secretos desde la CLI
gh secret set API_KEY --body "my-secret-value"
gh secret set DATABASE_URL < .env.production
```

---

## Branch Protection Rules

```
Configurar en: Settings → Branches → Add rule

Para la rama main, recomendado:
  ✅ Require a pull request before merging
  ✅ Require approvals: 1 (o más en equipos grandes)
  ✅ Dismiss stale pull request approvals when new commits are pushed
  ✅ Require review from Code Owners
  ✅ Require status checks to pass before merging
      → Agregar: "lint-and-type-check", "test", "build"
  ✅ Require branches to be up to date before merging
  ✅ Require conversation resolution before merging
  ✅ Require signed commits (opcional, pero recomendado)
  ✅ Include administrators (aplicar también a admins)
  ✅ Restrict who can push to matching branches
  ✅ Do not allow bypassing the above settings
```

### CODEOWNERS — Revisores Automáticos

```bash
# .github/CODEOWNERS
# Formato: patrón  propietario(s)

# Por defecto, todos los archivos
*                   @org/team-lead

# Directorio específico
/src/payments/      @alice @bob

# Archivos de configuración de infraestructura
*.tf                @org/devops-team
docker-compose*.yml @org/devops-team
.github/            @org/devops-team

# Por extensión de archivo
*.sql               @org/dba-team
```

---

## GitHub CLI — Productividad desde la Terminal

```bash
# Autenticarse
gh auth login

# ── Pull Requests ─────────────────────────────────────────────────────
gh pr create                              # crear PR interactivamente
gh pr create --title "feat: add X" --body "Description" --base main
gh pr create --draft                      # crear PR en borrador

gh pr list                                # listar PRs abiertos
gh pr list --author "@me"                 # mis PRs
gh pr list --reviewer "@me"               # PRs que debo revisar

gh pr view                                # ver el PR de la rama actual
gh pr view 123                            # ver PR específico por número
gh pr view --web                          # abrir en el browser

gh pr checkout 123                        # hacer checkout del PR localmente
gh pr merge 123 --squash                  # mergear con squash
gh pr merge 123 --rebase                  # mergear con rebase
gh pr close 123                           # cerrar sin mergear

gh pr review --approve                    # aprobar el PR actual
gh pr review --request-changes -b "Needs X"

# ── Issues ────────────────────────────────────────────────────────────
gh issue create
gh issue list --label "bug" --assignee "@me"
gh issue view 456
gh issue close 456

# ── Releases ──────────────────────────────────────────────────────────
gh release create v1.2.3 --title "v1.2.3" --notes "Release notes"
gh release create v1.2.3 dist/*.tar.gz    # con archivos adjuntos
gh release list

# ── Actions/Workflows ─────────────────────────────────────────────────
gh workflow list
gh workflow run ci.yml                    # disparar workflow manualmente
gh run list                              # ver ejecuciones recientes
gh run view 12345                        # ver detalles de una ejecución
gh run watch                             # monitorear la ejecución actual

# ── Repositorios ──────────────────────────────────────────────────────
gh repo create my-new-repo --public
gh repo clone usuario/repo
gh repo fork usuario/repo --clone

# ── Gists ─────────────────────────────────────────────────────────────
gh gist create script.sh --public
gh gist list

# Extensiones de gh
gh extension install mislav/gh-branch     # gestión de ramas
gh extension install nicowillis/gh-copilot # GitHub Copilot
```

---

## Git Hooks con Husky y lint-staged

```bash
# Instalar
npm install --save-dev husky lint-staged

# Inicializar husky
npx husky init

# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx lint-staged

# .husky/commit-msg
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx --no -- commitlint --edit "$1"

# .husky/pre-push
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npm test

# lint-staged en package.json — solo lint los archivos en staging
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{js,jsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yaml,yml}": [
      "prettier --write"
    ],
    "*.css": [
      "stylelint --fix",
      "prettier --write"
    ]
  }
}
```
