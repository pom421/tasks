---
name: livrer
description: Vérifier, documenter, commiter, pousser et ouvrir une PR vers main pour une modification terminée, puis suivre la CI de la PR. À utiliser à la fin de chaque demande de l'utilisateur qui modifie le code.
---

# Livrer une modification

1. **Vérifier** (tout doit passer) : `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.
   Un test qui échoue n'est jamais « instable » : trouver la cause
   (`pnpm exec playwright test -g "<nom>" --repeat-each 20`).
2. **Relire `git diff`** : code mort, commentaires périmés, anglais, cas oublié
   (filtres combinés, liste vide…).
3. **Docs** : `README.md` (usage, raccourcis, modèle de données), aide `?`
   (`SECTIONS` de `HelpDialog.tsx`), `docs/plan.md` (tâche directement dans
   « Fait », questions dans « Décisions attendues » ; une tâche d'une PR déjà
   fusionnée encore « En cours » passe aussi en « Fait »).
4. **Commit** en français (`feat:` / `fix:` / `style:` / `test:` / `docs:`),
   titre court, corps en puces, lignes d'attribution de la session.
5. **Pousser et ouvrir la PR** : jamais de push direct sur `main`, sauf pour
   un changement qui ne touche que la configuration de Claude (`CLAUDE.md`,
   `.claude/`) : `git push origin HEAD:main`, sans PR. Sur une
   branche de travail (en créer une si on est sur `main`) :
   `git push -u origin <branche>` (réessayer jusqu'à 4 fois si erreur réseau :
   2, 4, 8, 16 s), puis `gh pr create --base main` (titre = celui du commit,
   corps en puces, ligne d'attribution de la session). Une nouvelle demande sur
   la même branche, PR encore ouverte : nouveau commit, même PR.
   PR créée : lien de la PR ajouté à sa ligne de `docs/plan.md`, commit `docs:`
   poussé sur la même branche (pas de PR à part).
6. **CI** : app de bureau, PR suivie par l'app → elle prévient d'un échec, ne
   rien programmer. Sinon : vérification dans 4 minutes, consigne « skill
   verifier-ci pour la PR <numéro> ».
7. **Répondre** selon `CLAUDE.md`, avec le **lien de la PR**. Ne pas fusionner :
   l'utilisateur relit et fusionne.
