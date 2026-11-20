import { err, ok, type Result } from "@/lib/result";
import type { ToolModule, ToolReader } from "../_contract";

export type UnknownTool = {
  readonly code: "unknown_tool";
  readonly id: string;
};
export type UnsupportedVersion = {
  readonly code: "unsupported_version";
  readonly id: string;
  readonly version: string;
};

export type Registry = {
  readonly tools: readonly ToolModule[];
  readonly toolIds: readonly string[];
  readonly getTool: (id: string) => Result<ToolModule, UnknownTool>;
  /** The current module when `version` matches, otherwise its frozen `readers[version]`. */
  readonly getReader: (
    id: string,
    version: string,
  ) => Result<ToolReader, UnknownTool | UnsupportedVersion>;
};

/** Builds the lookups over a list of modules (spec 0005, AC-2). Never throws. */
export const makeRegistry = (tools: readonly ToolModule[]): Registry => {
  const getTool = (id: string): Result<ToolModule, UnknownTool> => {
    const tool = tools.find((t) => t.id === id);
    return tool ? ok(tool) : err({ code: "unknown_tool", id });
  };

  const getReader = (
    id: string,
    version: string,
  ): Result<ToolReader, UnknownTool | UnsupportedVersion> => {
    const tool = getTool(id);
    if (!tool.ok) return tool;
    if (tool.value.version === version) return ok(tool.value);
    const reader = Object.hasOwn(tool.value.readers ?? {}, version)
      ? tool.value.readers?.[version]
      : undefined;
    return reader
      ? ok(reader)
      : err({ code: "unsupported_version", id, version });
  };

  return { tools, toolIds: tools.map((t) => t.id), getTool, getReader };
};
