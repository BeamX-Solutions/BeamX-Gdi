import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_STARTED,
  downloadErrorMessage,
  downloadMyData,
  EXPORT_PATH,
  fileNameFrom,
} from "./download-data";

describe("downloadErrorMessage", () => {
  it("explains the limit, no session, and anything else", () => {
    expect(downloadErrorMessage(429)).toMatch(/this hour/);
    expect(downloadErrorMessage(401)).toMatch(/no data/);
    expect(downloadErrorMessage(500)).toMatch(/couldn't prepare/);
    expect(downloadErrorMessage(0)).toMatch(/couldn't prepare/);
  });
});

describe("fileNameFrom", () => {
  it("takes the server's file name", () => {
    expect(
      fileNameFrom(
        'attachment; filename="beamx-data-2026-11-28.json"',
        "2000-01-01",
      ),
    ).toBe("beamx-data-2026-11-28.json");
  });

  it("falls back to a dated name", () => {
    expect(fileNameFrom(null, "2026-11-28")).toBe("beamx-data-2026-11-28.json");
  });
});

describe("downloadMyData (spec 0017, AC-7, AC-8)", () => {
  // The browser pieces it touches, stubbed: fetch, an <a> to click, and object URLs.
  const link = {
    href: "",
    download: "",
    click: vi.fn(),
    remove: vi.fn(),
  };
  const stubBrowser = (fetchImpl: () => Promise<Response>) => {
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    vi.stubGlobal("document", {
      createElement: vi.fn(() => link),
      body: { append: vi.fn() },
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:beamx"),
      revokeObjectURL: vi.fn(),
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    link.href = "";
    link.download = "";
  });

  it("fetches the export uncached and saves it under the server's file name", async () => {
    stubBrowser(
      async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "Content-Disposition":
              'attachment; filename="beamx-data-2026-11-28.json"',
          },
        }),
    );
    expect(await downloadMyData()).toBe(DOWNLOAD_STARTED);
    expect(fetch).toHaveBeenCalledWith(EXPORT_PATH, { cache: "no-store" });
    expect(link.download).toBe("beamx-data-2026-11-28.json");
    expect(link.href).toBe("blob:beamx");
    expect(link.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:beamx");
  });

  it("shows the limit message on a 429 and saves nothing", async () => {
    stubBrowser(async () => new Response("{}", { status: 429 }));
    expect(await downloadMyData()).toBe(downloadErrorMessage(429));
    expect(link.click).not.toHaveBeenCalled();
  });

  it("shows a general message when the network fails, never throwing", async () => {
    stubBrowser(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await downloadMyData()).toBe(downloadErrorMessage(0));
  });
});
