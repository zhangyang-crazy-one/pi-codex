# pi-codex

Pi plugin for Codex search, image generation, remote compaction, and the live Codex context window.

Derived from [zigai/pi-codex-core](https://github.com/zigai/pi-codex-core) under the MIT license. This package keeps that plugin's `web_run`, `imagegen`, `view_image`, and Codex compaction v2, and adds the account catalog window.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Install

```sh
pi install git:github.com/zhangyang-crazy-one/pi-codex
```

## Dynamic context

On each Codex turn the plugin reads `$CODEX_HOME/models_cache.json` (default `~/.codex/models_cache.json`) and writes the resolved window onto the active `openai-codex` model. Pi's usage meter, Pi compaction, and this plugin's remote compaction all read that value.

`context.window` in `/codex`:

| Mode | Window |
| --- | --- |
| `default` | Catalog `context_window` (272K for current GPT-6 / 6.1 rows) |
| `max` | Catalog `max_context_window` (872K for those rows) |
| `codex-config` | Top-level `model_context_window` in `~/.codex/config.toml`, clamped to the catalog maximum. Missing config uses the catalog default. |

The default mode is `codex-config`. `effective_context_window_percent` is kept on the parsed row and is not applied again, because Pi already reserves tokens and this plugin compacts at its own percentage of the selected window. `supports_experimental_context` is recorded from the catalog; `max` still selects the account maximum when that flag is false.

## Features

### Tools

- `web_run` — Codex-backed web search using the OpenAI Codex search endpoint, supporting cached, indexed, and live modes.
- `imagegen` — Codex image generation and editing.
- `view_image` — Native local image viewing.
- `apply_patch` — Optional port of the Codex native `apply_patch` editing tool. Enabling it replaces Pi's standard `edit` tool.

### System prompt

Model-aware Codex prompt mode uses matching bundled GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna, or GPT-5.5 system prompts adapted to Pi's active tools and runtime context.

### Compaction

Optional Codex remote compaction v2 replay supports OpenAI Codex response models, with chaining, metadata, fallbacks, world-state injection, auto-compaction, and token-aware context shrinking.

### Turn recovery

Resumes transiently failed Codex turns after Pi exhausts standard retry attempts.

### Slash command

Use the `/codex` slash command to manage extension settings and usage:

- Configure extension settings through a dedicated interactive interface.
- View current usage metrics and reset expiration dates.
- Activate available usage resets.

### Additional capabilities

- Compatibility for GPT-6 Astra/Sol/Luna and GPT-5.6 Responses Lite during standard turns, image descriptions, and native compaction.
- Streamed reasoning trace controls for GPT Responses models.
- Fast mode option to prioritize response speed.

<!-- pi-extension-settings:start -->
## Configuration

Global settings are stored in `~/.pi/agent/extension-settings/pi-codex-core.json`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scope.tools` | `codex` \| `all` | `"codex"` | Expose Codex tools only for Codex models (`codex`) or for all models (`all`). |
| `tools.webSearch` | boolean | `true` | Enable the `web_run` web search tool. |
| `tools.webSearchMode` | `cached` \| `indexed` \| `live` | `"live"` | Set search mode: `cached`, `indexed`, or `live`. |
| `tools.imageGeneration` | boolean | `true` | Enable the `imagegen` image generation and editing tool. |
| `tools.viewImage` | boolean | `true` | Enable the `view_image` local image viewing tool. |
| `tools.viewImageDescriptions` | boolean | `false` | Include Codex-generated descriptions when viewing images. |
| `tools.applyPatch` | `off` \| `openai` \| `all` | `"off"` | Replace standard `edit` with `apply_patch`: `off`, `openai`, or `all`. |
| `prompt.mode` | `pi` \| `codex` | `"codex"` | Enable model-aware Codex prompts (`codex`) or standard Pi prompts (`pi`). |
| `prompt.personality` | `friendly` \| `pragmatic` \| `none` | `"pragmatic"` | Set Codex communication style: `friendly`, `pragmatic`, or `none`. |
| `compaction.enabled` | boolean | `true` | Enable Codex-style conversation compaction. |
| `compaction.auto` | boolean | `true` | Automatically trigger compaction when reaching the context threshold. |
| `compaction.thresholdPercent` | integer | `80` | Context percentage threshold that triggers auto-compaction. |
| `context.window` | `default` \| `max` \| `codex-config` | `"codex-config"` | Context window for Codex models: catalog default (272K), account maximum, or the Codex CLI model_context_window. |
| `recovery.enabled` | boolean | `true` | Resume transiently failed Codex turns after Pi exhausts retries. |
| `recovery.batchFollowUps` | boolean | `false` | Deliver user follow-up messages sent during a turn together when it completes. |
| `recovery.maxAttempts` | integer | `3` | Maximum delayed resume attempts for a failed turn. |
| `recovery.baseDelayMs` | integer | `30000` | Initial recovery delay in milliseconds. |
| `recovery.maxDelayMs` | integer | `120000` | Maximum recovery delay in milliseconds. |
| `openai.webSearchModel` | string | `"current"` | Model for `web_run`; `current` uses the active model. |
| `openai.imageModel` | string | `"gpt-image-2"` | Model for `imagegen`. |
| `openai.imageDescriptionModel` | string | `"current"` | Model for image descriptions; `current` uses the active model. |
| `openai.compactionModel` | string | `"current"` | Model for compaction; `current` uses the active model. |
| `openai.compactionReasoning` | string | `"medium"` | Reasoning effort for compaction requests: `medium`, `current`, `max`, or `ultra`. |
| `openai.verbosity` | `low` \| `medium` \| `high` | `"low"` | Verbosity level for Codex API requests: `low`, `medium`, or `high`. |
| `openai.fast` | boolean | `false` | Prioritize speed for supported OpenAI models. |
| `openai.showReasoningTraces` | boolean | `true` | Stream reasoning trace summaries for GPT Responses models. |

```json
{
  "$schema": "./schemas/pi-codex-core.schema.json",
  "scope": {
    "tools": "codex"
  },
  "tools": {
    "webSearch": true,
    "webSearchMode": "live",
    "imageGeneration": true,
    "viewImage": true,
    "viewImageDescriptions": false,
    "applyPatch": "off"
  },
  "prompt": {
    "mode": "codex",
    "personality": "pragmatic"
  },
  "compaction": {
    "enabled": true,
    "auto": true,
    "thresholdPercent": 80
  },
  "context": {
    "window": "codex-config"
  },
  "recovery": {
    "enabled": true,
    "batchFollowUps": false,
    "maxAttempts": 3,
    "baseDelayMs": 30000,
    "maxDelayMs": 120000
  },
  "openai": {
    "webSearchModel": "current",
    "imageModel": "gpt-image-2",
    "imageDescriptionModel": "current",
    "compactionModel": "current",
    "compactionReasoning": "medium",
    "verbosity": "low",
    "fast": false,
    "showReasoningTraces": true
  }
}
```
<!-- pi-extension-settings:end -->

## Acknowledgements

This extension builds upon initial work by Igor Warzocha in [`pi-codex-conversion`](https://github.com/IgorWarzocha/howaboua-pi-stuff/tree/main/packages/pi-codex-conversion).

## License

[MIT](LICENSE)
