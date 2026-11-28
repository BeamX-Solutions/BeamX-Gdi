import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { exportData, exportHour, EXPORTS_PER_HOUR } =
  await import("./export-data");
type Deps = Parameters<typeof exportData>[0];

const empty = {
  user: [],
  conversations: [],
  messages: [],
  runs: [],
  answers: [],
  reports: [],
  profile: [],
  creditAccount: [],
  ledger: [],
  holds: [],
  payments: [],
  consultations: [],
  policies: [],
};

const deps = (over: Partial<Deps> = {}): Deps => ({
  take: vi.fn(async () => 1),
  giveBack: vi.fn(async () => {}),
  read: vi.fn(async () => empty),
  now: () => new Date("2026-11-28T14:30:00.000Z"),
  log: vi.fn(),
  ...over,
});

describe("exportData (spec 0017, AC-7)", () => {
  it("refuses with no session", async () => {
    const d = deps();
    expect(await exportData(d, null)).toEqual({
      kind: "error",
      status: 401,
      code: "unauthenticated",
    });
    expect(d.read).not.toHaveBeenCalled();
  });

  it("returns the user's file, named by day, keyed by the UTC hour", async () => {
    const d = deps();
    const reply = await exportData(d, "u1");
    expect(reply.kind).toBe("file");
    if (reply.kind !== "file") return;
    expect(reply.fileName).toBe("beamx-data-2026-11-28.json");
    expect(d.read).toHaveBeenCalledWith("u1");
    expect(d.take).toHaveBeenCalledWith("limit:data_export:u1:2026-11-28T14");
  });

  it("allows 3 an hour and refuses the 4th, giving its count back", async () => {
    const allowed = deps({ take: vi.fn(async () => EXPORTS_PER_HOUR) });
    expect((await exportData(allowed, "u1")).kind).toBe("file");
    const refused = deps({ take: vi.fn(async () => EXPORTS_PER_HOUR + 1) });
    expect(await exportData(refused, "u1")).toMatchObject({ status: 429 });
    expect(refused.giveBack).toHaveBeenCalled();
    expect(refused.read).not.toHaveBeenCalled();
  });

  it("lets the export through when the counter fails", async () => {
    const d = deps({ take: vi.fn(async () => null) });
    expect((await exportData(d, "u1")).kind).toBe("file");
  });

  it("gives the count back when the read fails", async () => {
    const d = deps({
      read: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(exportData(d, "u1")).rejects.toThrow("db down");
    expect(d.giveBack).toHaveBeenCalled();
  });

  it("logs ids and counts only", async () => {
    const d = deps();
    await exportData(d, "u1");
    expect(d.log).toHaveBeenCalledWith("data_exported", {
      userId: "u1",
      conversations: 0,
      runs: 0,
    });
  });

  it("buckets by UTC hour", () => {
    expect(exportHour(new Date("2026-11-28T23:59:59.000Z"))).toBe(
      "2026-11-28T23",
    );
  });
});
