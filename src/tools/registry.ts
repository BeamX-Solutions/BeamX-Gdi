/**
 * The installed tools (spec 0005). Adding a tool is one folder under `src/tools/` plus
 * one entry in this list. The assistant reaches tools only through this file.
 *
 * Pure, so it is safe on the server and the client.
 */
import type { ToolModule } from "./_contract";
import { makeRegistry } from "./_kit/registry";

// Stellar joins this list with its port (spec 0005, build plan task 2).
export const tools: readonly ToolModule[] = [];

const registry = makeRegistry(tools);

export const { toolIds, getTool, getReader } = registry;
