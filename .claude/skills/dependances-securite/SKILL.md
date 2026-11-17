---
name: dependances-securite
description: Cooldown pnpm (7 jours), exceptions pour un correctif de sécurité, pnpm audit. À utiliser avant d'ajouter ou de mettre à jour une dépendance, ou pour corriger une faille signalée.
---

# Dépendances : cooldown et failles

Config dans `pnpm-workspace.yaml`. Pourquoi : un mainteneur piraté publie une
version piégée ; le cooldown (`minimumReleaseAge: 10080` = 7 jours) laisse le
temps de la retirer. Il vaut aussi pour les dépendances transitives. Revers :
il retarde les correctifs, d'où des exceptions **ciblées et temporaires**.

## Ajouter ou mettre à jour

1. Vérifier la date de publication : `npm view <paquet> time --json | tail`.
   Moins de 7 jours : attendre ou prendre la version précédente.
2. Version **exacte** dans `package.json` (`savePrefix: ''`).
3. `pnpm install`, puis `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

## Corriger une faille (`pnpm audit`, seuil `high`)

Échoue dès qu'une faille atteint `audit.level`. Avant d'agir, lire l'advisory
officiel (lien GHSA) : une « version de sécurité » peut être un piège.

| Cas | Commande | Effet |
|---|---|---|
| Le parent autorise le patch (plage large) | `pnpm audit --fix=update` | met à jour le lockfile, config intacte |
| Le parent bloque le patch (version exacte) | `pnpm audit --fix` | ajoute un `overrides` permanent |

- Un `overrides` s'oublie : le retirer dès que le parent publie une version
  corrigée, et relire la liste de temps en temps.
- Faille sans effet sur le projet : `pnpm audit --ignore <GHSA>`, avec la
  raison en commentaire.

## Exception au cooldown (correctif trop récent)

Cas manuel : faille annoncée, correctif publié il y a moins de 7 jours.

- Ajouter dans `minimumReleaseAgeExclude` **une version précise**
  (`paquet@1.2.3`), jamais le paquet entier : sans version, le cooldown saute
  pour toutes ses versions et le prune ne la retire pas.
- `minimumReleaseAgeExcludePrune: true` retire seul les exceptions devenues
  inutiles ; vérifier la liste après chaque mise à jour.
- Toujours dans une PR, avec le lien de l'advisory dans le message de commit.

## Environnement local (bac à sable Linux)

Node et pnpm sont dans `~/.local` (`PATH` dans `/etc/sandbox-persistent.sh`),
à la version épinglée (`engines`, `packageManager`) et hors cooldown.
`node_modules` d'un Mac ne marche pas sous Linux (binaires natifs) : installer
dans un worktree, jamais dans le dépôt principal, que l'hôte partage.
