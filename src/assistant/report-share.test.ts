import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { FAKE_STELLAR_ANALYSIS } = await import("@/lib/fake-model");
const { getTool, scoreRun } = await import("@/tools/registry");
const { headlineOf, isoDay, loadReportPdf, longDay, pdfFilename } =
  await import("./report-pdf");
const { downloadPdf, emailReport, hourOf, maskEmail, REPORT_EMAILS_PER_HOUR } =
  await import("./report-share");

type PdfDeps = import("./report-pdf").PdfDeps;
type EmailDeps = import("./report-share").EmailDeps;
type Question = import("@/tools/registry").ToolQuestion;

// Spec 0015, AC-1 to AC-7.

const OWNER = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000002";
const CHAT = "00000000-0000-4000-8000-000000000003";
const PDF = Buffer.from("%PDF-1.7 fake");

/** A complete, valid set of Stellar answers: the first option or lowest value. */
const sampleValue = (q: Question): unknown => {
  switch (q.kind) {
    case "single":
      return q.options[0]?.value;
    case "multi":
      return [q.options[0]?.value];
    case "scale":
      return q.min;
    case "text":
      return q.id === "business_name" ? "Ada Foods" : "A short answer";
  }
};

const stellar = getTool("stellar");
if (!stellar.ok) throw new Error("stellar missing");
const answers = stellar.value.questions.map((q) => ({
  questionId: q.id,
  value: sampleValue(q),
  updatedAt: "2026-11-27 10:00:00+00",
}));
const scored = scoreRun(stellar.value, answers);
if (!scored.ok) throw new Error("sample answers do not score");

const readyRead = (status = "ready") => ({
  run: {
    toolId: "stellar",
    toolVersion: stellar.value.version,
    completedAt: "2026-11-27 10:05:00+00",
    conversationId: CHAT,
    scores: scored.value.scores,
  },
  answers,
  report: { status, content: { analysis: FAKE_STELLAR_ANALYSIS } },
});

const pdfDeps = (read = readyRead()) => {
  const render = vi.fn<PdfDeps["render"]>(async () => PDF);
  const deps: PdfDeps = {
    readRun: async (ownerId, runId) =>
      ownerId === OWNER && runId === RUN
        ? { ok: true, value: read }
        : { ok: false, error: { code: "not_found" } },
    render,
  };
  return { deps, render };
};

describe("pdf helpers", () => {
  const at = new Date("2026-11-27T23:30:00Z");

  it("dates in Lagos and names the file BeamX-<Tool>-<day>.pdf (AC-1)", () => {
    // 23:30 UTC is already the 28th in Lagos.
    expect(isoDay(at)).toBe("2026-11-28");
    expect(longDay(at)).toBe("28 November 2026");
    expect(pdfFilename("Beacon", at)).toBe("BeamX-Beacon-2026-11-28.pdf");
    expect(pdfFilename("Luna 2", at)).toBe("BeamX-Luna2-2026-11-28.pdf");
  });

  it("takes the email headline from the score header", () => {
    expect(
      headlineOf("Stellar", [
        { kind: "text", title: "x", paragraphs: [] },
        {
          kind: "score_header",
          score: 62.5,
          max: 100,
          title: "Building Blocks",
        } as never,
      ]),
    ).toBe("Stellar 62.5 of 100: Building Blocks");
    expect(
      headlineOf("Stellar", [{ kind: "text", title: "x", paragraphs: [] }]),
    ).toBeNull();
  });

  it("masks all but the first letter of the address (AC-6)", () => {
    expect(maskEmail("ada@gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("broken")).toBe("***");
  });

  it("buckets the limit by UTC hour", () => {
    expect(hourOf(new Date("2026-11-27T14:59:59Z"))).toBe("2026-11-27T14");
  });
});

describe("loadReportPdf (AC-1, AC-3)", () => {
  it("renders a ready Stellar report with the block layout", async () => {
    const { deps, render } = pdfDeps();
    const r = await loadReportPdf(deps, OWNER, RUN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.filename).toBe("BeamX-Stellar-2026-11-27.pdf");
    expect(r.value.conversationId).toBe(CHAT);
    const input = render.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      kind: "blocks",
      toolName: "Stellar",
      business: null,
      date: "27 November 2026",
    });
  });

  it("is not_found for someone else's run and not_ready before ready", async () => {
    expect(await loadReportPdf(pdfDeps().deps, "someone", RUN)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(
      await loadReportPdf(pdfDeps(readyRead("generating")).deps, OWNER, RUN),
    ).toEqual({ ok: false, error: { code: "not_ready" } });
  });

  it("maps errors to 404 and 409 for the download route", async () => {
    expect(await downloadPdf(pdfDeps().deps, "someone", RUN)).toEqual({
      ok: false,
      reply: { status: 404, body: { code: "not_found" } },
    });
    expect(
      await downloadPdf(pdfDeps(readyRead("pending")).deps, OWNER, RUN),
    ).toEqual({
      ok: false,
      reply: { status: 409, body: { code: "not_ready" } },
    });
  });
});

describe("emailReport (AC-5)", () => {
  const account = { id: OWNER, isAnonymous: false, email: "ada@gmail.com" };

  const emailDeps = (over: Partial<EmailDeps> = {}) => {
    const counts = new Map<string, number>();
    const send = vi.fn<EmailDeps["send"]>(async () => ({
      ok: true,
      value: undefined,
    }));
    const deps: EmailDeps = {
      ...pdfDeps().deps,
      take: async (key) => {
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return n;
      },
      giveBack: async (key) => {
        counts.set(key, (counts.get(key) ?? 1) - 1);
      },
      send,
      appUrl: "https://app.beamx.test/",
      now: () => new Date("2026-11-27T14:00:00Z"),
      log: vi.fn(),
      ...over,
    };
    return { deps, send, counts };
  };

  it("sends the PDF with the headline and chat link, and masks the address", async () => {
    const { deps, send } = emailDeps();
    expect(await emailReport(deps, account, RUN)).toEqual({
      status: 200,
      body: { sentTo: "a***@gmail.com" },
    });
    const [to, input, pdf] = send.mock.calls[0] ?? [];
    expect(to).toBe("ada@gmail.com");
    expect(input).toMatchObject({
      toolName: "Stellar",
      chatUrl: `https://app.beamx.test/c/${CHAT}`,
    });
    expect(pdf).toEqual({
      filename: "BeamX-Stellar-2026-11-27.pdf",
      content: PDF,
    });
  });

  it("refuses guests with sign_in_required", async () => {
    const { deps, send } = emailDeps();
    expect(
      await emailReport(deps, { ...account, isAnonymous: true }, RUN),
    ).toEqual({ status: 401, body: { code: "sign_in_required" } });
    expect(send).not.toHaveBeenCalled();
  });

  it(`allows ${REPORT_EMAILS_PER_HOUR} an hour, then 429`, async () => {
    const { deps, send } = emailDeps();
    for (let i = 0; i < REPORT_EMAILS_PER_HOUR; i += 1)
      expect((await emailReport(deps, account, RUN)).status).toBe(200);
    expect(await emailReport(deps, account, RUN)).toEqual({
      status: 429,
      body: { code: "rate_limited" },
    });
    expect(send).toHaveBeenCalledTimes(REPORT_EMAILS_PER_HOUR);
  });

  it("gives the count back and says 502 when the send fails", async () => {
    const { deps, counts } = emailDeps({
      send: async () => ({ ok: false, error: { code: "email_send_failed" } }),
    });
    expect(await emailReport(deps, account, RUN)).toEqual({
      status: 502,
      body: { code: "email_send_failed" },
    });
    expect([...counts.values()]).toEqual([0]);
  });

  it("gives the count back for a report that isn't ready", async () => {
    const { deps, counts } = emailDeps({
      ...pdfDeps(readyRead("pending")).deps,
    });
    expect((await emailReport(deps, account, RUN)).status).toBe(409);
    expect([...counts.values()]).toEqual([0]);
  });

  it("lets the email through when the counter fails", async () => {
    const { deps } = emailDeps({ take: async () => null });
    expect((await emailReport(deps, account, RUN)).status).toBe(200);
  });
});
