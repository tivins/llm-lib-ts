# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

## [0.3.1] - 2026-09-16
### Added
- Exemple `examples/streamToolExample.ts` : chat en streaming avec boucle d'outil simple (`get_time`).

### Changed
- `examples/streamExample.ts` : configuration via variables d'environnement (`PROVIDER_URL`, `API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT`) ; le résumé du raisonnement est délimité par `<thought>…</thought>` et affiché en streaming dans une section dédiée (tolère un cadre ``` parasite).

## [0.3.0] - 2026-09-14
### Added
- `LLMRequestError` : les erreurs HTTP des endpoints exposent `status`, `code`, `providerMessage`, `providerName` et `metadata` (format OpenAI / OpenRouter), en streaming comme hors streaming.

### Changed
- Le `.message` des erreurs de requête inclut désormais le statut HTTP, le code et le fournisseur, ainsi qu'un extrait de `metadata.raw` tronqué à 200 caractères.
