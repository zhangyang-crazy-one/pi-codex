import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** How the live Codex catalog chooses the window Pi should budget against. */
export type CodexContextWindowMode = "default" | "max" | "codex-config";

export const CODEX_CONTEXT_WINDOW_MODES: readonly CodexContextWindowMode[] = [
    "default",
    "max",
    "codex-config",
];

/** One model row from the Codex CLI account catalog. */
export type CodexCatalogModel = {
    readonly slug: string;
    readonly contextWindow: number;
    readonly maxContextWindow: number;
    readonly effectiveContextWindowPercent: number;
    readonly supportsExperimentalContext: boolean;
};

type MutableContextModel = {
    provider: string;
    id: string;
    contextWindow: number;
};

type CatalogCache = {
    readonly path: string;
    readonly mtimeMs: number;
    readonly models: ReadonlyMap<string, CodexCatalogModel>;
};

let catalogCache: CatalogCache | undefined;

/** Directory that holds the Codex CLI login and model catalog. */
export function codexHomeDirectory(): string {
    const configured = process.env.CODEX_HOME?.trim();
    return configured && configured.length > 0 ? configured : join(homedir(), ".codex");
}

/**
 * Reads `models_cache.json` written by the Codex CLI.
 * A missing or unreadable catalog returns an empty map so Pi keeps its own window.
 */
export function loadCodexModelCatalog(
    catalogPath: string = join(codexHomeDirectory(), "models_cache.json"),
): ReadonlyMap<string, CodexCatalogModel> {
    let mtimeMs = 0;
    try {
        mtimeMs = statSync(catalogPath).mtimeMs;
    } catch {
        catalogCache = undefined;
        return new Map();
    }

    if (catalogCache?.path === catalogPath && catalogCache.mtimeMs === mtimeMs) {
        return catalogCache.models;
    }

    try {
        const models = parseCodexModelsCache(JSON.parse(readFileSync(catalogPath, "utf8")));
        catalogCache = { path: catalogPath, mtimeMs, models };
        return models;
    } catch {
        catalogCache = undefined;
        return new Map();
    }
}

/** Drops the in-process catalog cache. Tests use this between fixtures. */
export function clearCodexModelCatalogCache(): void {
    catalogCache = undefined;
}

/** Parses a Codex `models_cache.json` document into slug-keyed windows. */
export function parseCodexModelsCache(value: unknown): ReadonlyMap<string, CodexCatalogModel> {
    const models = new Map<string, CodexCatalogModel>();
    for (const row of catalogRows(value)) {
        const model = parseCatalogModel(row);
        if (model) models.set(model.slug, model);
    }

    return models;
}

/**
 * Reads the top-level `model_context_window` from a Codex `config.toml`.
 * Nested tables are ignored. A missing value means the catalog default applies.
 */
export function parseCodexCliContextWindow(toml: string): number | undefined {
    for (const line of toml.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith("[")) break;
        if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

        const match = /^model_context_window\s*=\s*(\d+)\s*(?:#.*)?$/.exec(trimmed);
        if (!match?.[1]) continue;

        const parsed = Number(match[1]);
        if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }

    return undefined;
}

/** Reads `model_context_window` from the local Codex CLI config, if present. */
export function loadCodexCliContextWindow(
    configPath: string = join(codexHomeDirectory(), "config.toml"),
): number | undefined {
    try {
        return parseCodexCliContextWindow(readFileSync(configPath, "utf8"));
    } catch {
        return undefined;
    }
}

/**
 * Picks the token window Pi should use for one catalog row.
 * `codex-config` follows the CLI's `model_context_window`, clamped to the account maximum.
 */
export function resolveCodexContextWindow(input: {
    readonly entry: CodexCatalogModel | undefined;
    readonly mode: CodexContextWindowMode;
    readonly configuredWindow?: number | undefined;
}): number | undefined {
    const entry = input.entry;
    if (!entry) return undefined;

    if (input.mode === "default") return entry.contextWindow;
    if (input.mode === "max") return entry.maxContextWindow;

    const configured = input.configuredWindow;
    if (configured === undefined || !Number.isSafeInteger(configured) || configured <= 0) {
        return entry.contextWindow;
    }

    return Math.min(configured, entry.maxContextWindow);
}

/**
 * Writes the resolved window onto an `openai-codex` model object.
 * Pi's usage meter and both compaction paths read that same object.
 */
export function applyResolvedContextWindow(
    model: MutableContextModel | null | undefined,
    contextWindow: number | undefined,
): boolean {
    if (!model || contextWindow === undefined) return false;
    if (model.provider.trim().toLowerCase() !== "openai-codex") return false;
    if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) return false;
    if (model.contextWindow === contextWindow) return false;

    model.contextWindow = contextWindow;
    return true;
}

/** Applies the live catalog window to the active Codex model. */
export function applyCatalogContextToModel(
    model: MutableContextModel | null | undefined,
    mode: CodexContextWindowMode,
): boolean {
    if (!model) return false;

    const entry = loadCodexModelCatalog().get(model.id.trim().toLowerCase());
    const contextWindow = resolveCodexContextWindow({
        entry,
        mode,
        configuredWindow: mode === "codex-config" ? loadCodexCliContextWindow() : undefined,
    });
    return applyResolvedContextWindow(model, contextWindow);
}

function catalogRows(value: unknown): readonly unknown[] {
    if (typeof value !== "object" || value === null || !("models" in value)) return [];

    const models = value.models;
    return Array.isArray(models) ? models : [];
}

function parseCatalogModel(value: unknown): CodexCatalogModel | undefined {
    if (typeof value !== "object" || value === null) return undefined;

    const slug = stringField(value, "slug")?.trim().toLowerCase();
    const contextWindow = positiveIntegerField(value, "context_window");
    if (!slug || contextWindow === undefined) return undefined;

    const maxContextWindow = positiveIntegerField(value, "max_context_window") ?? contextWindow;
    const percent = positiveIntegerField(value, "effective_context_window_percent");

    return {
        slug,
        contextWindow,
        maxContextWindow: Math.max(contextWindow, maxContextWindow),
        effectiveContextWindowPercent: percent !== undefined && percent <= 100 ? percent : 95,
        supportsExperimentalContext: booleanField(value, "supports_experimental_context") === true,
    };
}

function stringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key);
    return typeof field === "string" ? field : undefined;
}

function positiveIntegerField(value: object, key: string): number | undefined {
    const field = Reflect.get(value, key);
    return typeof field === "number" && Number.isSafeInteger(field) && field > 0
        ? field
        : undefined;
}

function booleanField(value: object, key: string): boolean | undefined {
    const field = Reflect.get(value, key);
    return typeof field === "boolean" ? field : undefined;
}
