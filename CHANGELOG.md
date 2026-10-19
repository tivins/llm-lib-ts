# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

## [0.8.0] - 2026-10-19
### Added
- `ChatCompletionChunk.usage` (`Usage | null`, dernier paramètre optionnel du constructeur) : l'usage des tokens en cours à chaque morceau du flux. `chatCompletionStream` envoie `timings_per_token: true` et lit les `timings` que llama.cpp ajoute à chaque morceau (`prompt_n + cache_n` pour le prompt, `predicted_n` pour la sortie). Un serveur sans ces `timings` laisse `usage` à `null` sur les morceaux de texte.
- Un dernier morceau (`delta` vide, sans `finishReason`) porte l'usage final du serveur, le même objet que `response.usage`. Il compte le token de fin de génération, donc il peut dépasser d'un token le dernier compte en cours.
- `Usage.reasoningTokens` (`number | null`, défaut `null`) : en streaming, les tokens générés avant le premier delta de réponse ou d'appel d'outil (balises de réflexion comprises) ; sinon `completion_tokens_details.reasoning_tokens` quand le serveur le fournit. `Usage.fromApiShape()` lit un objet `usage` OpenAI ; `toJSON()` n'ajoute `completion_tokens_details` que si la valeur est connue.
- `examples/streamExample.ts` affiche l'usage en fin de réponse ; section « Stream » du README complétée.
- Tests : `tests/LLM.test.ts` (paramètre `timings_per_token`, usage en cours, point de bascule de la réflexion, flux coupé pendant la réflexion, modèle sans réflexion, serveur sans `timings`, `reasoning_tokens` en non-streaming) ; e2e `ex160-stream-usage` (usage sur chaque morceau, croissant, morceau final égal à `response.usage`). Le `StubLLM` émet aussi le morceau final d'usage.

## [0.7.0] - 2026-10-18
### Added
- Option `seed` dans `ChatCompletionOptionsInit` / `ChatCompletionOptions` : envoyée comme `seed` dans la requête seulement si elle est définie (`0` compris). Sans `seed`, la requête est inchangée.
- Exemple `examples/structuredOutputExample.ts` : réponse contrainte par un schéma JSON (`ResponseFormat.jsonSchema`), puis décodée avec `JSON.parse`. Lien depuis la section « Structured output » du README.
- Nouvel exemple minimal `examples/streamExample.ts` : la réponse s'affiche au fil de l'eau via `chatCompletionStream`, sans le reste.

### Changed
- L'ancien `examples/streamExample.ts` (chat interactif, raisonnement, spinner, log) devient `examples/streamChatExample.ts`.

## [0.6.0] - 2026-10-18
### Changed
- **Cassant** : le constructeur de `ChatCompletionOptions` prend un objet `ChatCompletionOptionsInit` (exporté) au lieu de 8 arguments positionnels, par exemple `new ChatCompletionOptions({ temperature: 0.8, responseFormat: format })`. Tous les champs sont optionnels ; un champ absent ou `undefined` prend sa valeur par défaut (`temperature` 0.7, `topP` 1.0, `n` 1). `new ChatCompletionOptions()` est inchangé. Migration : `new ChatCompletionOptions(model)` devient `new ChatCompletionOptions({ model })`.
- README et exemples passés à la nouvelle forme.
- Tests : `tests/ChatCompletionOptions.test.ts` (valeurs par défaut, champs partiels, `undefined` explicite, `clone()`) ; tests unitaires et e2e convertis.

## [0.5.0] - 2026-10-12
### Added
- Sorties structurées : `ResponseFormat` (`text()`, `jsonObject()`, `jsonSchema(name, schema, strict)`). `ChatCompletionOptions.responseFormat` accepte un `ResponseFormat` en plus d'une string ; `jsonSchema` part au format OpenAI (`{ type: "json_schema", json_schema: { name, schema, strict } }`) et llama-server en tire une grammaire. Une string reste envoyée telle quelle sous la forme `{ type }`.
- Tests : `tests/ResponseFormat.test.ts` (payload, `clone()`) et e2e `ex150-json-schema` (schéma strict avec `enum`, `required`, `additionalProperties: false`, `minItems`/`maxItems`, en direct et en streaming).

## [0.4.0] - 2026-10-12
### Added
- `Agent.runTurnStream` : même boucle d'outils que `runTurn`, via `chatCompletionStream`.
- Exemple minimal dans `examples/minimal.ts`.
- Multimodal : `Attachment` (images `image/*` et vidéos `video/*`, via `fromFile`, `fromBytes` ou `fromBase64`) joint à un message avec `Message.user(texte, attachments)` ou le nouveau paramètre `attachments` du constructeur de `Message`. Les médias partent en base64 dans des parts `image_url` / `video_url` ; les logs ne gardent que les métadonnées (type, MIME, taille, nom).
- Exemple `examples/multimodalExample.ts` : poser une question sur une ou plusieurs images/vidéos.

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
