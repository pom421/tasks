---
name: verifier-ci
description: Vérifier le résultat de la CI GitHub Actions de pom421/tasks pour une PR (ou un commit), et corriger si elle est rouge. À utiliser quand un rappel de vérification de CI se déclenche ou après un push.
---

# Vérifier la CI

1. PR : `gh pr checks <numéro> --repo pom421/tasks`. Commit : retrouver son run
   (`head_sha`) parmi les derniers (`gh run list --limit 5`).
2. **En cours** : app de bureau (PR suivie par l'app) → rien à programmer ;
   sinon revérifier dans 3 minutes, sans rien dire.
3. **Vert** : tâche en « Fait » (avec le lien de la PR) dans `docs/plan.md`,
   commit `docs:` sur la **branche de la PR** (pas de PR à part) ; réponse en
   puces avec les liens de la PR et du run.
4. **Rouge** :
   - lire les logs du job en échec (~120 lignes), reproduire en local ;
   - trouver la **cause** : jamais relancer « pour voir », désactiver un test ni
     commit vide ;
   - cause fréquente : test e2e qui attend la base au lieu de l'affichage ;
   - corriger, `--repeat-each 20` sur le test, toute la suite, puis skill
     `livrer` (même branche, même PR) ; expliquer la cause en puces + un point « à retenir ».
