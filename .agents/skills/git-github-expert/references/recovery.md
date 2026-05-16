# Recuperación de Desastres — Commits Perdidos y Situaciones Críticas

## git reflog — Tu Red de Seguridad

El reflog es el historial de todos los movimientos de HEAD. **Git casi nunca borra
commits de forma permanente** — el reflog te permite recuperarlos.

```bash
# Ver el reflog (los últimos 90 días por defecto)
git reflog
# Output:
# a1b2c3d (HEAD -> main) HEAD@{0}: commit: feat: add payment module
# b2c3d4e HEAD@{1}: reset: moving to HEAD~3
# c3d4e5f HEAD@{2}: commit: docs: update API documentation
# d4e5f6g HEAD@{3}: commit: fix: resolve cart total bug
# e5f6g7h HEAD@{4}: checkout: moving from feature to main

# Reflog de una rama específica
git reflog main
git reflog feature/mi-feature

# Con fechas
git reflog --date=iso
# a1b2c3d HEAD@{2024-01-15 10:30:00 -0300}: commit: feat: add payment

# Ver los últimos N entradas
git reflog -10
```

---

## Escenario 1 — "Hice git reset --hard y perdí mis cambios"

```bash
# Situación: hiciste git reset --hard HEAD~3 y perdiste 3 commits

# Paso 1: ver el reflog para encontrar el estado antes del reset
git reflog
# b2c3d4e HEAD@{1}: reset: moving to HEAD~3   ← justo antes del reset
# HEAD@{2}: commit: feat: mi último commit    ← el commit que querías

# Paso 2: recuperar apuntando al commit anterior
git reset --hard b2c3d4e    # el hash justo ANTES del reset
# O:
git reset --hard HEAD@{1}   # el estado de HEAD hace 1 movimiento

# Paso 3: verificar que los commits están de vuelta
git log --oneline -5

# Alternativa — si no quieres mover main, crear una rama desde el estado perdido
git checkout -b recuperacion-commits b2c3d4e
```

---

## Escenario 2 — "Commiteé en la rama equivocada"

```bash
# Situación: hiciste commits en main cuando debías hacerlos en feature/nueva

# OPCIÓN A: si los commits deben ir a una rama nueva
# Paso 1: anotar los hashes de los commits que moviste por error
git log --oneline -3
# a1b2c3d feat: mi commit equivocado
# b2c3d4e feat: otro commit equivocado

# Paso 2: crear la rama correcta DESDE EL ESTADO ACTUAL (con los commits)
git checkout -b feature/donde-debian-ir    # la nueva rama tiene tus commits

# Paso 3: volver main al estado correcto (antes de tus commits)
git checkout main
git reset --hard HEAD~2                    # deshacer los 2 commits de main

# OPCIÓN B: si los commits deben ir a una rama EXISTENTE
# Paso 1: anotar el hash de cada commit
git log --oneline -3

# Paso 2: ir a la rama correcta y cherry-pick
git checkout feature/existente
git cherry-pick a1b2c3d b2c3d4e            # en orden cronológico

# Paso 3: deshacer de la rama equivocada
git checkout main
git reset --hard HEAD~2
```

---

## Escenario 3 — "Borré una rama sin querer"

```bash
# Situación: git branch -D feature/importante-sin-mergear

# Paso 1: buscar en el reflog
git reflog
# b2c3d4e HEAD@{5}: checkout: moving from feature/importante to main
# El hash justo antes del checkout es el último commit de la rama borrada

# Paso 2: recuperar la rama
git checkout -b feature/importante b2c3d4e
# O:
git branch feature/importante b2c3d4e

# Buscar el commit si no recuerdas el hash
git fsck --lost-found          # lista objetos "colgantes" (sin referencia)
git log --all --oneline --graph  # ver todos los commits de todas las ramas

# Los commits dangling aparecerán en .git/lost-found/commit/
ls .git/lost-found/commit/
```

---

## Escenario 4 — "Hice force push y sobrescribí el remoto"

```bash
# Situación: git push --force y borraste el trabajo de otros

# URGENTE: si alguien más tiene los commits en su copia local, pedirles que:
git log --oneline -5    # encontrar el último commit bueno

# Si tienes el reflog del remoto (en GitHub: rama → commits recientes)
# O si alguien del equipo tiene los commits:
git fetch compañero main:main-recuperado  # fetch desde el repo del compañero

# Si tienes acceso a GitHub:
# 1. Ir a github.com/repo/commits/rama
# 2. El historial puede estar disponible hasta que el GC lo limpie
# 3. Anotar los hashes de los commits perdidos

# Si nadie más tiene los commits:
git reflog                               # buscar en tu reflog local
git reset --hard HASH_ANTES_DEL_FORCE_PUSH

# Pushear el estado recuperado
git push --force-with-lease origin main  # restaurar el remoto

# Aprender: SIEMPRE usar --force-with-lease en lugar de --force
# --force-with-lease falla si alguien más pusheó desde tu último fetch
```

---

## Escenario 5 — "Commiteé información sensible (contraseñas, keys)"

```bash
# URGENCIA MÁXIMA: revocar/invalidar la credencial INMEDIATAMENTE
# La eliminación del historial no es suficiente si alguien ya hizo fetch

# OPCIÓN A: si fue hace muy poco y NADIE más hizo fetch
git reset --soft HEAD~1         # deshacer el commit
# Editar el archivo para quitar la credencial
git add .
git commit -m "fix: add configuration without sensitive data"
git push --force-with-lease

# OPCIÓN B: si ya fue pusheado o hubo fetch de otros
# Usar git-filter-repo (más seguro que filter-branch)
pip install git-filter-repo

git filter-repo --replace-text <(echo 'secret_key=REPLACED_SECRET_KEY')
# O eliminar el archivo completo de toda la historia:
git filter-repo --path archivo-con-secreto.env --invert-paths

# Después:
git push --force origin main    # actualizar el remoto
# TODOS los colaboradores deben hacer: git clone (no git pull)

# OPCIÓN C: en GitHub, usar el botón "Protect this push" si aparece
# O contactar a GitHub Support si es un repositorio público

# Prevención: .gitignore + git-secrets + pre-commit hooks
npm install --save-dev @secretlint/secretlint @secretlint/secretlint-rule-preset-recommend
# .secretlintrc.json:
# { "rules": [{ "id": "@secretlint/secretlint-rule-preset-recommend" }] }
```

---

## Escenario 6 — "El rebase se complicó y está todo roto"

```bash
# Situación: estás en medio de un rebase que salió mal

# OPCIÓN A: abortar INMEDIATAMENTE (si el rebase no ha terminado)
git rebase --abort                  # vuelve al estado EXACTO antes del rebase
# ✅ Esta opción siempre está disponible mientras el rebase está en progreso

# OPCIÓN B: el rebase terminó pero el resultado está mal
git reflog                          # buscar el estado antes del rebase
# Ejemplo: HEAD@{5}: rebase (finish): ...
# El estado antes del rebase estará en HEAD@{6} o después

git reset --hard HEAD@{6}           # volver al estado antes del rebase
```

---

## Escenario 7 — "Perdí un stash"

```bash
# Situación: git stash drop o git stash clear accidental

# Los stashes son commits, aparecen en el reflog y en los objetos dangling
git fsck --unreachable | grep commit
# Para cada hash que aparece, ver si contiene tus cambios:
git stash show <hash>

# O con un poco más de contexto:
git log --graph --oneline --decorate --all $(git fsck --no-reflog | \
    awk '/dangling commit/ {print $3}')

# Recuperar un stash perdido
git stash apply <hash>
# O crear una rama con ese stash:
git checkout -b recuperar-stash <hash>
```

---

## Diagnóstico General — Cuando Git está Extraño

```bash
# Ver el estado completo de todo
git status
git log --oneline -10
git reflog -10

# Ver en qué estado está el repo (merge, rebase, cherry-pick en progreso?)
ls .git/
# MERGE_HEAD   → hay un merge en progreso
# CHERRY_PICK_HEAD → hay un cherry-pick en progreso
# REBASE_HEAD  → hay un rebase en progreso

cat .git/HEAD              # ver a qué apunta HEAD
cat .git/MERGE_HEAD        # el commit que se está mergeando

# Verificar integridad del repo
git fsck --full

# Ver qué archivos están en staging
git ls-files --stage

# Ver el contenido del staging area
git diff --cached

# Situación: detached HEAD (HEAD no apunta a ninguna rama)
git log --oneline -3       # ver dónde estás
git checkout -b mi-nueva-rama   # crear rama para no perder los commits
# O volver a una rama existente:
git checkout main          # HEAD vuelve a apuntar a main
```

---

## Prevención — Hábitos que Evitan Desastres

```bash
# 1. NUNCA hacer --force sin --force-with-lease
# Alias:
git config --global alias.pushf "push --force-with-lease"

# 2. Crear una rama de backup antes de operaciones peligrosas
git branch backup-antes-del-rebase      # backup del estado actual
git rebase -i HEAD~10                   # si falla: git reset --hard backup-antes-del-rebase

# 3. Verificar SIEMPRE antes de reset --hard
git status                              # ver qué se va a perder
git stash                               # guardar cambios primero si es necesario

# 4. Preferir git restore sobre git checkout para archivos
git restore archivo.txt                 # más claro que git checkout -- archivo.txt

# 5. Usar git switch en lugar de git checkout para ramas
git switch main                         # más claro que git checkout main

# 6. git status antes de cualquier operación de historia
# Nunca hacer rebase/reset/etc con cambios sin commitear en el working directory

# 7. Configurar el reflog para durar más tiempo
git config --global gc.reflogExpire 180       # 180 días para HEAD
git config --global gc.reflogExpireUnreachable 90  # 90 días para commits inalcanzables
```
