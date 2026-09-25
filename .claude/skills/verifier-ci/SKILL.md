---
name: verifier-ci
description: Vérifier le résultat de la CI GitHub Actions de pom421/tasks pour un commit poussé sur main, et corriger si elle est rouge. À utiliser quand un rappel de vérification de CI se déclenche ou après un push.
---

# Vérifier la CI

1. Lister les derniers runs du dépôt `pom421/tasks` (outil GitHub
   `actions_list`, méthode `list_workflow_runs`, 3 à 5 résultats) et retrouver
   celui du commit visé (`head_sha`).
2. **En cours** : reprogrammer une vérification dans 3 minutes, ne rien dire à
   l'utilisateur.
3. **Vert** : dans `docs/plan.md`, passer la tâche en « Fait » (avec le sha) ;
   annuler les rappels devenus inutiles ; réponse de 2-3 puces avec le lien du run.
4. **Rouge** :
   - lire les logs du job en échec (`get_job_logs`, `failed_only`, ~120 lignes) ;
   - reproduire en local (voir le skill `livrer` pour les commandes) ;
   - trouver la **cause**. Interdits : relancer « pour voir », désactiver ou
     sauter un test, commit vide ;
   - cause fréquente : test e2e qui attend l'état de la base au lieu de
     l'affichage → attendre un attribut ou un texte visible ;
   - corriger, vérifier avec `--repeat-each 20` sur le test concerné, puis
     toute la suite ;
   - pousser (skill `livrer`), expliquer la cause en 3 puces et donner un point
     « à retenir ».
