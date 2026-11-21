import { beforeEach, describe, expect, it, vi } from "vitest";

const { logEvent, checkBotId } = vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
  return { logEvent: vi.fn(), checkBotId: vi.fn() };
});

vi.mock("./log", () => ({ logEvent }));
vi.mock("botid/server", () => ({ checkBotId }));

const { isBot } = await import("./bot-check");

describe("isBot", () => {
  beforeEach(() => {
    logEvent.mockClear();
    checkBotId.mockReset();
  });

  it("returns BotID's verdict", async () => {
    checkBotId.mockResolvedValueOnce({ isBot: true });
    expect(await isBot()).toBe(true);
    checkBotId.mockResolvedValueOnce({ isBot: false });
    expect(await isBot()).toBe(false);
  });

  it("fails open and logs when BotID itself fails, so the route never 500s", async () => {
    checkBotId.mockRejectedValueOnce(new Error("no OIDC token"));
    expect(await isBot()).toBe(false);
    expect(logEvent).toHaveBeenCalledWith("bot_check_failed", {});
  });
});
