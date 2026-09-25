#!/bin/bash
# Installe les dépendances dans un conteneur Claude Code (web / cloud).
# Idempotent et non interactif : peut tourner à chaque démarrage de session.
# Utilisé par le hook .claude/hooks/session-start.sh et, au choix, par le
# « Setup script » de l'environnement cloud (voir README, section Claude Code).
set -euo pipefail

cd "$(dirname "$0")/.."

# pnpm de la version épinglée dans package.json (packageManager, vérifiée par hash).
if ! corepack enable 2>/dev/null; then
  npm install -g corepack
  corepack enable
fi

# Lockfile respecté à la lettre ; le store pnpm est gardé en cache par le conteneur.
pnpm install --frozen-lockfile

# Pas de téléchargement de navigateur : Chromium est déjà dans le conteneur
# (/opt/pw-browsers), détecté par playwright.config.ts.
echo "Dépendances installées. Tests : pnpm typecheck && pnpm test && pnpm test:e2e"
