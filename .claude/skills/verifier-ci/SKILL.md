---
name: verifier-ci
description: Vérifier le résultat de la CI GitHub Actions de pom421/tasks pour un commit poussé sur main, et corriger si elle est rouge. À utiliser quand un rappel de vérification de CI se déclenche ou après un push.
---

# Vérifier la CI

1. Retrouver le run du commit (`head_sha`) parmi les derniers de `pom421/tasks`
   (`gh run list --limit 5`, ou l'outil GitHub `list_workflow_runs`).
2. **En cours** : revérifier dans 3 minutes, sans rien dire.
3. **Vert** : tâche en « Fait » (avec le sha) dans `docs/plan.md` ; 2-3 puces
   avec le lien du run.
4. **Rouge** :
   - lire les logs du job en échec (~120 lignes), reproduire en local ;
   - trouver la **cause** : jamais relancer « pour voir », désactiver un test ni
     commit vide ;
   - cause fréquente : test e2e qui attend la base au lieu de l'affichage ;
   - corriger, `--repeat-each 20` sur le test, toute la suite, puis skill
     `livrer` ; expliquer la cause en 3 puces + un point « à retenir ».
