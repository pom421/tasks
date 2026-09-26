---
name: livrer
description: Vérifier, documenter, commiter et pousser une modification terminée sur main, puis programmer la vérification de la CI. À utiliser à la fin de chaque demande de l'utilisateur qui modifie le code.
---

# Livrer une modification

1. **Vérifications** (toutes doivent passer, sinon corriger avant d'aller plus loin) :
   ```sh
   pnpm typecheck
   pnpm test
   pnpm test:e2e
   ```
   Un test qui échoue n'est jamais « instable » : trouver la cause. En cas de doute,
   `pnpm exec playwright test -g "<nom>" --repeat-each 20`.
2. **Relire le diff** (`git diff`) comme un relecteur : code mort, commentaires
   périmés, textes en anglais, cas oublié (plusieurs filtres combinés, liste vide…).
3. **Documentation à jour** :
   - `README.md` : section Utilisation, tableau des raccourcis, modèle de données ;
   - aide `?` : sections `SECTIONS` de `src/components/HelpDialog.tsx` ;
   - `docs/plan.md` : tâche en « Fait » avec le commit (ou « En cours » tant que
     la CI n'est pas verte), décisions à trancher dans « Décisions attendues ».
4. **Commit** en français : `feat:` / `fix:` / `style:` / `test:` / `docs:`, titre
   court, corps en puces (quoi et pourquoi), terminé par les lignes d'attribution
   demandées par la session.
5. **Pousser** : `git push -u origin main` (réessayer jusqu'à 4 fois en cas
   d'erreur réseau : 2 s, 4 s, 8 s, 16 s).
6. **CI** : programmer une vérification dans 4 minutes (`send_later`) avec la
   consigne « utiliser le skill verifier-ci pour le commit <sha> ».
7. **Réponse à l'utilisateur** (voir `CLAUDE.md`) : une phrase sur le rôle, puis
   des puces courtes, par thème ; un point « à retenir » (mentor) ; les choix faits
   sans demande explicite ; les questions à trancher.
