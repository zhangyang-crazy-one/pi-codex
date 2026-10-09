import assert from "node:assert/strict";
import { test } from "vitest";

import {
    applyResolvedContextWindow,
    parseCodexCliContextWindow,
    parseCodexModelsCache,
    resolveCodexContextWindow,
} from "../src/codex/catalog-context.ts";

const catalog = {
    models: [
        {
            slug: "gpt-6.1-sol",
            context_window: 272000,
            max_context_window: 872000,
            effective_context_window_percent: 95,
            supports_experimental_context: false,
        },
        {
            slug: "gpt-6-sol",
            context_window: 272000,
            max_context_window: 872000,
            supports_experimental_context: true,
        },
    ],
};

test("parses Codex catalog windows without treating the effective percent as the window", () => {
    const models = parseCodexModelsCache(catalog);
    const sol = models.get("gpt-6.1-sol");
    assert.ok(sol);
    assert.equal(sol.contextWindow, 272_000);
    assert.equal(sol.maxContextWindow, 872_000);
    assert.equal(sol.effectiveContextWindowPercent, 95);
    assert.equal(sol.supportsExperimentalContext, false);
    assert.equal(models.get("gpt-6-sol")?.supportsExperimentalContext, true);
});

test("resolves default, max, and Codex CLI windows", () => {
    const entry = parseCodexModelsCache(catalog).get("gpt-6.1-sol");
    assert.equal(resolveCodexContextWindow({ entry, mode: "default" }), 272_000);
    assert.equal(resolveCodexContextWindow({ entry, mode: "max" }), 872_000);
    assert.equal(
        resolveCodexContextWindow({ entry, mode: "codex-config", configuredWindow: 400_000 }),
        400_000,
    );
    assert.equal(
        resolveCodexContextWindow({ entry, mode: "codex-config", configuredWindow: 900_000 }),
        872_000,
    );
    assert.equal(resolveCodexContextWindow({ entry, mode: "codex-config" }), 272_000);
});

test("reads only the top-level Codex CLI context window", () => {
    const toml = [
        'model = "gpt-6.1-sol"',
        "model_context_window = 400000",
        "",
        "[tui]",
        "model_context_window = 1",
    ].join("\n");
    assert.equal(parseCodexCliContextWindow(toml), 400_000);
    assert.equal(parseCodexCliContextWindow("# model_context_window = 12\n"), undefined);
});

test("updates only openai-codex models", () => {
    const codex = { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 272_000 };
    const other = { provider: "openai", id: "gpt-6.1-sol", contextWindow: 272_000 };
    assert.equal(applyResolvedContextWindow(codex, 400_000), true);
    assert.equal(codex.contextWindow, 400_000);
    assert.equal(applyResolvedContextWindow(codex, 400_000), false);
    assert.equal(applyResolvedContextWindow(other, 872_000), false);
    assert.equal(other.contextWindow, 272_000);
});
