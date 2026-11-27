import { describe, expect, it, vi } from "vitest";
import { render } from "@react-email/components";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { reportMailer } = await import("./send");
const { ReportEmail } = await import("./report-email");
const { reportEmailText } = await import("./report-copy");

type Deps = Parameters<typeof reportMailer>[0];

// Spec 0015, AC-5: the report email.

const input = {
  toolName: "Beacon",
  headline: "Beacon 62.5 of 100: Building Blocks",
  chatUrl: "https://app.beamx.test/c/abc",
};
const pdf = {
  filename: "BeamX-Beacon-2026-11-27.pdf",
  content: Buffer.from("%PDF"),
};

const deps = (over: Partial<Deps> = {}) => {
  const sent: unknown[] = [];
  const log = vi.fn();
  const devPrint = vi.fn();
  const mail = reportMailer({
    send: async (email) => {
      sent.push(email);
      return { error: null };
    },
    from: "BeamX <no-reply@beamx.test>",
    deployed: true,
    render: async () => "<p>report</p>",
    log,
    devPrint,
    ...over,
  });
  return { sent, log, devPrint, mail };
};

describe("reportMailer", () => {
  it("sends the PDF attached with the subject and plain text", async () => {
    const { sent, log, mail } = deps();
    expect(await mail("ada@gmail.com", input, pdf)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sent[0]).toMatchObject({
      to: "ada@gmail.com",
      subject: "Your BeamX Beacon report",
      text: reportEmailText(input),
      attachments: [pdf],
    });
    // Ids and purpose only, never the address.
    expect(JSON.stringify(log.mock.calls)).not.toContain("ada@");
  });

  it("is email_send_failed on a deploy with no key, and prints in dev", async () => {
    const deployed = deps({ send: null });
    expect(await deployed.mail("ada@gmail.com", input, pdf)).toEqual({
      ok: false,
      error: { code: "email_send_failed" },
    });
    const local = deps({ send: null, deployed: false });
    expect((await local.mail("ada@gmail.com", input, pdf)).ok).toBe(true);
    expect(local.devPrint).toHaveBeenCalledOnce();
  });

  it("turns a provider error or a throw into email_send_failed", async () => {
    const provider = deps({ send: async () => ({ error: { name: "x" } }) });
    expect((await provider.mail("a@b.c", input, pdf)).ok).toBe(false);
    const thrown = deps({
      send: async () => {
        throw new Error("network");
      },
    });
    expect((await thrown.mail("a@b.c", input, pdf)).ok).toBe(false);
  });
});

describe("ReportEmail", () => {
  it("carries the headline, the chat link and the consultation line", async () => {
    const html = await render(ReportEmail(input));
    expect(html).toContain("Building Blocks");
    expect(html).toContain("https://app.beamx.test/c/abc");
    expect(html).toContain("strategy call");
  });

  it("leaves out the button when there is no chat", async () => {
    const html = await render(ReportEmail({ ...input, chatUrl: null }));
    expect(html).not.toContain("Open the chat");
    expect(reportEmailText({ ...input, chatUrl: null })).not.toContain(
      "Open the chat",
    );
  });
});
