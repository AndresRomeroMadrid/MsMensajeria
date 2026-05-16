# Resolución de Conflictos — Merge, Rebase y Estrategias

## Anatomía de un Conflicto de Merge

```
<<<<<<< HEAD                        ← tu versión (rama actual)
const price = calculateTotal();
console.log(`Total: ${price}`);
=======                             ← separador
const amount = getOrderTotal();
console.log(`Amount: $${amount}`);
>>>>>>> feature/new-pricing         ← versión entrante (rama que se mergea)
```

**Lo que significa cada sección:**
- `<<<<<<< HEAD` — inicio de TU versión
- `=======` — separador entre las dos versiones
- `>>>>>>> rama-nombre` — inicio de la versión ENTRANTE

**Opciones de resolución:**
1. Quedarte con tu versión (eliminar el bloque de ===== en adelante)
2. Quedarte con la versión entrante (eliminar el bloque de HEAD hasta =====)
3. Combinar ambas manualmente
4. Escribir algo completamente diferente

---

## El Proceso Completo de Resolución

```bash
# ── Cuando ocurre un conflicto durante merge ──────────────────────────
git merge feature/nueva-funcionalidad
# Auto-merging src/services/PriceService.ts
# CONFLICT (content): Merge conflict in src/services/PriceService.ts
# Automatic merge failed; fix conflicts and then commit the result.

# Paso 1: ver qué archivos tienen conflictos
git status
# both modified:   src/services/PriceService.ts
# both added:      src/utils/formatters.ts

# Paso 2: abrir cada archivo con conflicto y resolverlo
# (editar manualmente o usar una herramienta)

# Paso 3: marcar como resuelto
git add src/services/PriceService.ts
git add src/utils/formatters.ts

# Paso 4: completar el merge
git commit                     # Git auto-genera el mensaje de merge commit
# o con mensaje personalizado:
git commit -m "merge: integrar nueva lógica de precios de feature/nueva-funcionalidad"

# Abortar el merge si no quieres continuar
git merge --abort              # volver al estado anterior al merge

# ── Cuando ocurre durante rebase ─────────────────────────────────────
git rebase main
# CONFLICT (content): Merge conflict in src/api/orders.ts
# error: could not apply a1b2c3d... feat: add order filters

# Resolver el conflicto en src/api/orders.ts
git add src/api/orders.ts
git rebase --continue          # aplicar el siguiente commit del rebase

# Opciones durante el rebase:
git rebase --skip             # saltar este commit (raro — el commit queda perdido)
git rebase --abort            # cancelar TODO el rebase, volver al inicio
```

---

## Estrategias de Merge

```bash
# ── Merge estándar (crea un merge commit) ────────────────────────────
git merge feature

# ── Fast-forward (no crea merge commit — solo si es posible) ─────────
git merge --ff-only feature
# Falla si no es posible hacer FF (hay divergencia)

# ── Squash merge (aplasta todos los commits en uno) ──────────────────
git merge --squash feature
git commit -m "feat: implementar autenticación completa"
# ⚠️ squash merge NO preserva la historia de feature — los commits individuales
# no aparecerán en el log principal

# ── Ours strategy (ignorar todos los cambios entrantes) ───────────────
git merge -s ours old-branch  # útil para hacer merge "simbólico" sin cambios

# ── Theirs (aceptar todos los cambios entrantes sin conflicto) ─────────
# No existe como estrategia directa, pero se puede hacer así:
git merge feature
git checkout --theirs .   # acepta todos los cambios entrantes para archivos con conflicto
git add .
git commit

# ── Recursive strategy options ───────────────────────────────────────
git merge -X ours feature     # en conflictos, preferir la versión actual
git merge -X theirs feature   # en conflictos, preferir la versión entrante
# ⚠️ estos resuelven AUTOMÁTICAMENTE los conflictos sin preguntar
```

---

## Herramientas de Resolución de Conflictos

```bash
# Abrir la herramienta de merge configurada
git mergetool

# Abrir VS Code como merge tool
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'
git mergetool  # abre VS Code en el primer archivo con conflicto

# Usar vimdiff
git config --global merge.tool vimdiff
git mergetool

# Usar IntelliJ/IDEA
git config --global merge.tool intellij
git config --global mergetool.intellij.cmd '/path/to/idea merge "$LOCAL" "$REMOTE" "$BASE" "$MERGED"'

# Resolución manual con git checkout --ours / --theirs
git checkout --ours   path/to/file.txt   # acepta TU versión completamente
git checkout --theirs path/to/file.txt   # acepta LA VERSIÓN ENTRANTE completamente
# Luego:
git add path/to/file.txt

# Ver las tres versiones en un conflicto
git show :1:archivo.txt   # versión base (ancestro común)
git show :2:archivo.txt   # versión HEAD (tu versión)
git show :3:archivo.txt   # versión MERGE_HEAD (la versión entrante)
```

---

## git rerere — Reutilizar Resoluciones

`rerere` (Reuse Recorded Resolution) memoriza cómo resolviste un conflicto
y lo aplica automáticamente si el mismo conflicto aparece de nuevo.

```bash
# Activar rerere globalmente
git config --global rerere.enabled true

# Cómo funciona:
# 1. La primera vez que resuelves un conflicto, Git lo memoriza
# 2. La próxima vez que aparezca el mismo conflicto (mismo contexto),
#    Git lo resuelve automáticamente

# Ver qué tiene memorizado rerere
ls .git/rr-cache/

# Olvidar una resolución memorizada (si fue incorrecta)
git rerere forget path/to/file.txt

# Útil especialmente en:
# - topic branches que se integran frecuentemente a main
# - proyectos con muchas ramas activas simultáneamente
```

---

## Estrategias para Minimizar Conflictos

```bash
# 1. INTEGRAR FRECUENTEMENTE — el tiempo es el mayor creador de conflictos
#    Un merge después de 1 semana = 10x más conflictos que uno cada 2 días

# 2. Mantener las ramas cortas y enfocadas
#    Una rama por feature/fix, no acumular meses de trabajo

# 3. Comunicar con el equipo sobre qué archivos están tocando
#    Evitar que dos personas modifiquen el mismo archivo extensamente

# 4. Actualizar tu rama frecuentemente con main/develop
git fetch origin
git rebase origin/main   # o: git merge origin/main

# 5. Estrategia de rebase antes del PR
#    Antes de hacer el PR, hacer rebase sobre main para que el merge sea limpio

# 6. Dividir archivos grandes
#    Un archivo de 1000 líneas es más propenso a conflictos que 10 de 100 líneas

# 7. Usar .gitattributes para archivos que NO deberían dar conflictos
# .gitattributes:
# package-lock.json merge=ours  # ignorar cambios del remoto en package-lock

# 8. Para archivos binarios (imágenes, etc.)
# .gitattributes:
# *.png binary
# *.jpg binary
```

---

## Resolver Conflictos en package-lock.json

```bash
# package-lock.json es ESPECIALMENTE doloroso para los conflictos
# La mejor estrategia:

# Opción A: regenerar desde package.json
git checkout HEAD -- package-lock.json   # tomar TU versión
git checkout --theirs package-lock.json  # o tomar la versión entrante
npm install                              # regenerar correctamente
git add package-lock.json

# Opción B: usar npm para resolver
git checkout --theirs package-lock.json  # aceptar una versión
npm install --package-lock-only          # actualizar sin instalar
git add package-lock.json

# Configurar .gitattributes para que package-lock no dé conflictos
# .gitattributes:
# package-lock.json merge=ours
# O simplemente excluirlo del tracking y regenerarlo siempre:
# .gitignore: (no recomendado en proyectos colaborativos)
```
