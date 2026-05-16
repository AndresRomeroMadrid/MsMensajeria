# Git Diario — Comandos, Configuración y Productividad

## git log — Ver la Historia de Forma Útil

```bash
# El formato más útil para el día a día
git log --oneline --graph --decorate --all
# Alias recomendado:
git config --global alias.lg "log --oneline --graph --decorate --all"
# Uso: git lg

# Variaciones útiles
git log --oneline -10              # últimos 10 commits
git log --oneline main..feature   # commits en feature que no están en main
git log --oneline feature..main   # commits en main que no están en feature
git log --oneline --author="Alice" # commits de un autor específico
git log --oneline --since="2 weeks ago"
git log --oneline --after="2024-01-01" --before="2024-06-30"
git log --oneline --grep="fix"    # commits cuyo mensaje contiene "fix"
git log --oneline -S "functionName"  # commits que agregaron/quitaron ese texto (pickaxe)
git log --oneline -G "regex"      # commits que cambiaron líneas que coinciden con regex
git log --follow -- path/to/file  # historia de un archivo incluso si fue renombrado
git log --stat                    # mostrar archivos cambiados por commit
git log --patch -p -- file.txt    # diff completo de cada commit que tocó file.txt

# Pretty format personalizado
git log --pretty=format:"%h %ad | %s%d [%an]" --date=short
# Output: a1b2c3d 2024-01-15 | feat: add payment module (HEAD -> main) [Alice]

# Buscar texto en todos los commits de todos los branches
git log --all -S "password" --source  # ⚠️ útil para encontrar secretos accidentales
```

---

## git stash — Guardar Trabajo Temporal

```bash
# Guardar todos los cambios (tracked files)
git stash

# Guardar con mensaje descriptivo (recomendado)
git stash push -m "WIP: implementando paginación"

# Incluir archivos untracked
git stash push --include-untracked -m "WIP con archivos nuevos"

# Incluir TODOS los archivos (incluyendo ignored) — raramente necesario
git stash push --all

# Ver todos los stashes
git stash list
# stash@{0}: On feature/payment: WIP: implementando paginación
# stash@{1}: On main: experimento rápido

# Aplicar el stash más reciente (sin borrarlo)
git stash apply

# Aplicar un stash específico
git stash apply stash@{2}

# Aplicar Y borrar el stash
git stash pop

# Ver qué hay en un stash sin aplicarlo
git stash show -p stash@{0}

# Borrar un stash específico
git stash drop stash@{1}

# Borrar todos los stashes
git stash clear

# Crear una rama desde un stash (útil si los cambios ya no aplican limpiamente)
git stash branch nueva-rama stash@{0}

# Guardar solo algunos archivos en el stash
git stash push -m "solo estos" -- path/to/file1.txt path/to/file2.ts
```

---

## git diff — Entender los Cambios

```bash
# Diferencias en el working directory (sin stagear)
git diff

# Diferencias en el staging area (lo que irá al próximo commit)
git diff --staged
git diff --cached  # sinónimo de --staged

# Diferencias entre dos commits
git diff a1b2c3d..d4e5f6g

# Diferencias entre dos branches
git diff main..feature
git diff main feature  # equivalente

# Solo los nombres de archivos que cambiaron
git diff --name-only main..feature
git diff --name-status main..feature  # con estado: M=modified, A=added, D=deleted

# Diferencias de un archivo específico entre branches
git diff main..feature -- src/components/Button.tsx

# Estadísticas de cuánto cambió
git diff --stat main..feature

# Ignorar cambios de espacio en blanco
git diff -w
git diff --ignore-space-change

# Ver diferencias palabra por palabra (útil para documentación)
git diff --word-diff
```

---

## git add — Control Fino del Staging

```bash
# Agregar todo (cuidado con archivos no deseados)
git add .
git add -A

# Agregar archivo específico
git add src/services/UserService.ts

# Agregar de forma interactiva — elegir qué hunks agregar
git add -p                    # o --patch
# Opciones: y=sí, n=no, s=dividir más, e=editar manualmente, q=salir

# Agregar todos los archivos de un tipo
git add "*.tsx"
git add src/

# Ver qué está en staging antes de commitear
git status
git diff --staged             # ver el diff de lo que vas a commitear
```

---

## git commit — Buenos Commits

```bash
# Commit con mensaje inline (para mensajes cortos)
git commit -m "feat(auth): add refresh token endpoint"

# Commit abriendo el editor (para mensajes con cuerpo)
git commit

# Añadir cambios al último commit (sin crear nuevo commit)
git commit --amend            # abre editor para cambiar mensaje
git commit --amend --no-edit  # mantiene el mensaje, solo agrega los cambios

# Commitear todos los archivos tracked con cambios (saltarse el staging)
git commit -am "fix: corregir cálculo de impuestos"

# Commit con fecha específica (útil para migraciones de repositorios)
git commit --date="2024-01-15T10:30:00" -m "mensaje"

# Firmar el commit con GPG
git commit -S -m "feat: feature con firma GPG"
git config --global commit.gpgsign true  # firmar siempre automáticamente
```

---

## git branch — Gestión de Ramas

```bash
# Ver ramas locales
git branch

# Ver ramas remotas
git branch -r

# Ver todas (locales + remotas)
git branch -a

# Crear rama
git branch feature/nueva-funcionalidad

# Crear y cambiar a la nueva rama
git switch -c feature/nueva-funcionalidad
git checkout -b feature/nueva-funcionalidad  # equivalente clásico

# Cambiar de rama
git switch main
git checkout main  # equivalente clásico

# Renombrar rama actual
git branch -m nuevo-nombre

# Renombrar otra rama
git branch -m viejo-nombre nuevo-nombre

# Borrar rama (solo si ya fue mergeada)
git branch -d feature/completada

# Borrar rama FORZADO (incluso si no fue mergeada) ⚠️
git branch -D feature/abandona

# Borrar rama remota
git push origin --delete feature/completada

# Ver ramas con último commit y si ya están mergeadas a main
git branch -v
git branch --merged main      # ramas ya integradas en main
git branch --no-merged main   # ramas pendientes de integrar

# Limpiar referencias a ramas remotas borradas
git fetch --prune
git remote prune origin       # equivalente
```

---

## gitignore — Configuración Correcta

```bash
# Estructura del .gitignore
# Línea en blanco = ignorar
# # = comentario
# * = cualquier secuencia de caracteres
# ** = cualquier directorio
# ? = cualquier carácter
# ! = negación (incluir aunque esté en una regla de ignorar)

# Ejemplo .gitignore para proyecto Node.js + TypeScript
node_modules/
dist/
build/
.env
.env.local
.env.*.local
*.log
npm-debug.log*

# IDE
.vscode/
!.vscode/extensions.json    # incluir este aunque .vscode/ esté ignorado
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Cache
.cache/
.parcel-cache/

# Verificar si un archivo está siendo ignorado
git check-ignore -v path/to/file

# Ver todos los archivos ignorados
git status --ignored

# Agregar archivo que ya está en .gitignore al tracking (forzar)
git add -f archivo-ignorado.txt

# Dejar de trackear un archivo que ya está en el repo
git rm --cached archivo.txt   # el archivo permanece en disco
git rm --cached -r carpeta/   # recursivo
# Luego agregar al .gitignore

# .gitignore global (para archivos del sistema operativo e IDE)
git config --global core.excludesfile ~/.gitignore_global
# ~/.gitignore_global:
# .DS_Store
# .idea/
# *.swp
```

---

## git remote — Trabajar con Remotos

```bash
# Ver remotos configurados
git remote -v

# Agregar un remoto
git remote add origin git@github.com:usuario/repo.git
git remote add upstream git@github.com:original/repo.git  # para forks

# Cambiar URL de un remoto
git remote set-url origin git@github.com:usuario/repo-nuevo.git

# Eliminar un remoto
git remote remove origin

# Fetch de todos los remotos
git fetch --all

# Ver información de un remoto
git remote show origin

# Sincronizar fork con upstream
git fetch upstream
git checkout main
git merge upstream/main  # o: git rebase upstream/main
git push origin main

# Configurar tracking de la rama remota
git branch --set-upstream-to=origin/main main
git push -u origin feature/nueva  # -u configura el tracking automáticamente
```

---

## git config — Configuración Avanzada

```bash
# Ver toda la configuración efectiva
git config --list
git config --list --show-origin  # con el archivo de origen de cada config

# Ámbitos de configuración
git config --global   # ~/.gitconfig — para todos los repos
git config --local    # .git/config — solo para este repo
git config --system   # /etc/gitconfig — para todos los usuarios del sistema

# Alias útiles avanzados
git config --global alias.lg "log --color --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"
git config --global alias.last "log -1 HEAD --stat"
git config --global alias.visual "!gitk"
git config --global alias.aliases "config --get-regexp alias"

# Alias con comandos de shell (prefijo !)
git config --global alias.root '!git rev-parse --show-toplevel'
git config --global alias.contributors '!git shortlog --summary --numbered --email'

# Configuración de merge y diff tools
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'
git config --global diff.tool vscode
git config --global difftool.vscode.cmd 'code --wait --diff $LOCAL $REMOTE'
```
