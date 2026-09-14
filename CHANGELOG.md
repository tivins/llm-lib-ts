# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

## [0.3.0] - 2026-09-14
### Added
- `LLMRequestError` : les erreurs HTTP des endpoints exposent `status`, `code`, `providerMessage`, `providerName` et `metadata` (format OpenAI / OpenRouter), en streaming comme hors streaming.

### Changed
- Le `.message` des erreurs de requête inclut désormais le statut HTTP, le code et le fournisseur, ainsi qu'un extrait de `metadata.raw` tronqué à 200 caractères.
