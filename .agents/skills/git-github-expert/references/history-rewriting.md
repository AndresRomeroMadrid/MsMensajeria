# Reescritura de Historia — Rebase, Squash y Cherry-pick

## Rebase Interactivo — La Herramienta más Poderosa

El rebase interactivo te deja reorganizar, combinar, editar o eliminar commits
antes de compartirlos. **Regla de oro: nunca reescribir historia que ya fue pusheada
y compartida con otros.**

```bash
# Abrir rebase interactivo para los últimos N commits
git rebase -i HEAD~5

# Rebase interactivo desde el ancestro común con main
git rebase -i main

# Rebase interactivo desde el primer commit del repo
git rebase -i --root

# La interfaz muestra algo así:
# pick a1b2c3d feat: agregar componente de login
# pick b2c3d4e WIP: algo incompleto
# pick c3d4e5f fix: corregir typo en el título
# pick d4e5f6g fix: otro typo
# pick e5f6g7h feat: completar el componente de login
#
# Comandos disponibles:
# p, pick   = usar el commit tal cual
# r, reword = usar el commit pero cambiar el mensaje
# e, edit   = usar el commit pero pausar para modificarlo
# s, squash = combinar con el commit anterior (mantiene ambos mensajes)
# f, fixup  = como squash pero descarta el mensaje de este commit
# d, drop   = eliminar el commit completamente
# b, break  = pausar el rebase aquí (continuar con git rebase --continue)
# x, exec   = ejecutar un comando shell
# l, label  = poner una etiqueta al commit actual
# t, reset  = resetear HEAD a un label
```

### Flujos Comunes con Rebase Interactivo

```bash
# ── SQUASH: combinar WIP commits antes de hacer PR ───────────────────
# Estado inicial:
# a1b2c3d feat: inicio de login
# b2c3d4e WIP: avanzando
# c3d4e5f WIP: casi listo
# d4e5f6g feat: terminar login y tests

git rebase -i HEAD~4
# Cambiar a:
# pick a1b2c3d feat: inicio de login
# squash b2c3d4e WIP: avanzando
# squash c3d4e5f WIP: casi listo
# squash d4e5f6g feat: terminar login y tests
# Git abrirá el editor para que combines los mensajes

# ── REWORD: solo cambiar el mensaje de un commit ─────────────────────
git rebase -i HEAD~3
# Cambiar pick a reword en el commit que quieres editar
# Git te pedirá el nuevo mensaje

# ── DROP: eliminar un commit completamente ────────────────────────────
git rebase -i HEAD~5
# Cambiar pick a drop en el commit que quieres eliminar
# ⚠️ Los commits posteriores pueden tener conflictos

# ── EDIT: modificar el contenido de un commit ─────────────────────────
git rebase -i HEAD~3
# Cambiar pick a edit en el commit objetivo
# Git pausará en ese commit
git reset HEAD~1     # deshacer el commit, mantener los cambios staged
# Ahora puedes hacer los cambios que quieras
git add los-archivos-correctos
git commit -m "mensaje corregido"
git rebase --continue  # continuar el rebase

# ── REORDENAR commits: simplemente cambiar el orden en el editor ──────
# pick c1 primer commit
# pick c2 segundo commit
# pick c3 tercer commit
# →
# pick c1 primer commit
# pick c3 tercer commit  ← movido antes de c2
# pick c2 segundo commit
```

### Resolver Conflictos Durante el Rebase

```bash
# Si hay conflictos durante el rebase:
git status                    # ver qué archivos tienen conflictos
# Resolver los conflictos manualmente en los archivos
git add archivo-resuelto.txt
git rebase --continue         # continuar con el siguiente commit

# Opciones si te quedas atascado:
git rebase --skip             # saltar el commit actual (peligroso)
git rebase --abort            # cancelar TODO el rebase y volver al estado original

# Ver qué commit está siendo aplicado actualmente
cat .git/REBASE_HEAD
```

---

## git cherry-pick — Traer Commits Específicos

```bash
# Traer un commit específico a la rama actual
git cherry-pick a1b2c3d

# Traer múltiples commits
git cherry-pick a1b2c3d b2c3d4e

# Traer un rango de commits (sin incluir el primero)
git cherry-pick a1b2c3d..d4e5f6g

# Traer un rango de commits (incluyendo el primero)
git cherry-pick a1b2c3d^..d4e5f6g

# Cherry-pick sin commitear automáticamente (solo aplica los cambios)
git cherry-pick --no-commit a1b2c3d

# Cherry-pick con un mensaje de commit diferente
git cherry-pick a1b2c3d
git commit --amend -m "nuevo mensaje"

# Si hay conflictos:
# Resolver los archivos con conflicto
git add archivo-resuelto.txt
git cherry-pick --continue

# Cancelar el cherry-pick
git cherry-pick --abort

# Casos de uso clásicos:
# 1. Hotfix en main que también necesitas en develop
# 2. Traer un fix de otra branch sin hacer merge completo
# 3. Rescatar un commit de una branch que vas a borrar
```

---

## git rebase sobre una Rama Remota

```bash
# Actualizar tu rama con los últimos cambios de main
git fetch origin
git rebase origin/main           # reaplica tus commits sobre el main actualizado

# Equivalente pero con pull --rebase
git pull --rebase origin main

# Rebase con autostash (guarda y restaura cambios sin commitear automáticamente)
git rebase --autostash origin/main

# Después del rebase, el push necesita force (porque reescribiste historia)
git push --force-with-lease      # ✅ más seguro que --force
# --force-with-lease falla si alguien más pusheó mientras tanto

git push --force                 # ❌ sobrescribe sin verificar — peligroso en ramas compartidas
```

---

## git commit --amend — Modificar el Último Commit

```bash
# Cambiar solo el mensaje del último commit
git commit --amend -m "nuevo mensaje correcto"

# Cambiar el mensaje con el editor
git commit --amend

# Agregar archivos olvidados al último commit (sin cambiar el mensaje)
git add archivo-olvidado.txt
git commit --amend --no-edit

# Cambiar el autor del último commit
git commit --amend --author="Nuevo Autor <nuevo@email.com>" --no-edit

# Cambiar la fecha del último commit
git commit --amend --date="now" --no-edit        # fecha actual
git commit --amend --date="2024-01-15" --no-edit # fecha específica

# ⚠️ amend reescribe el commit (nuevo hash) — no usar si ya fue pusheado y compartido
```

---

## Estrategias Avanzadas de Rebase

```bash
# rebase --onto — cambiar el punto base de una rama
# Scenario: tienes feature que salió de experiment, pero quieres que salga de main
#
#   main → A → B → C
#               ↓
#          experiment → D → E
#                           ↓
#                        feature → F → G
#
# Quieres:
#   main → A → B → C → F' → G'  (sin D, E)

git rebase --onto main experiment feature
# git rebase --onto <nuevo-base> <viejo-base> <rama>

# Después:
#   main → A → B → C → F' → G'

# Ejemplo práctico: extraer commits de una rama feature a una nueva rama
git checkout -b nueva-feature
git rebase --onto main feature-original~3 nueva-feature
# Toma los últimos 3 commits de feature-original y los pone sobre main

# rebase para limpiar commits antes de un PR
git fetch origin
git rebase -i origin/main  # squash, reword, drop, reorder antes de hacer PR
git push --force-with-lease origin feature/mi-feature
```

---

## git filter-repo — Reescritura Masiva de Historia

```bash
# Instalar: pip install git-filter-repo

# CASOS DE USO:
# 1. Eliminar un archivo sensible de TODA la historia del repo
git filter-repo --path archivo-secreto.env --invert-paths

# 2. Eliminar una carpeta de toda la historia
git filter-repo --path secrets/ --invert-paths

# 3. Extraer una subcarpeta como nuevo repositorio
git filter-repo --subdirectory-filter src/

# 4. Reemplazar texto en toda la historia (ej: email antiguo por nuevo)
git filter-repo --replace-message replacements.txt
# replacements.txt: old-email@example.com==>new-email@example.com

# 5. Cambiar el autor en toda la historia
git filter-repo --commit-callback '
  if commit.author_email == b"old@email.com":
      commit.author_email = b"new@email.com"
      commit.author_name = b"New Name"
'

# ⚠️ filter-repo reescribe TODA la historia → todos los colaboradores necesitan
# hacer git clone nuevo después. Coordinar con el equipo.
# Después: git push --force (actualizar el remoto)
```
