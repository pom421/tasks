---
name: livrer
description: Vérifier, documenter, commiter et pousser une modification terminée sur main, puis programmer la vérification de la CI. À utiliser à la fin de chaque demande de l'utilisateur qui modifie le code.
---

# Livrer une modification

1. **Vérifier** (tout doit passer) : `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.
   Un test qui échoue n'est jamais « instable » : trouver la cause
   (`pnpm exec playwright test -g "<nom>" --repeat-each 20`).
2. **Relire `git diff`** : code mort, commentaires périmés, anglais, cas oublié
   (filtres combinés, liste vide…).
3. **Docs** : `README.md` (usage, raccourcis, modèle de données), aide `?`
   (`SECTIONS` de `HelpDialog.tsx`), `docs/plan.md` (« En cours » jusqu'à la CI
   verte, questions dans « Décisions attendues »).
4. **Commit** en français (`feat:` / `fix:` / `style:` / `test:` / `docs:`),
   titre court, corps en puces, lignes d'attribution de la session.
5. **Pousser** : `git push -u origin main` (réessayer jusqu'à 4 fois si erreur
   réseau : 2, 4, 8, 16 s).
6. **CI** : programmer une vérification dans 4 minutes, consigne « skill
   verifier-ci pour le commit <sha> ».
7. **Répondre** selon `CLAUDE.md`.
