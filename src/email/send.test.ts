import { describe, expect, it, vi } from "vitest";
import { render } from "@react-email/components";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { codeMailer } = await import("./send");
const { CodeEmail } = await import("./code-email");
const { codeEmailCopy, codeEmailText } = await import("./copy");

// Spec 0009, AC-17: the code emails.

const deps = (over: Partial<Parameters<typeof codeMailer>[0]> = {}) => {
  const sent: unknown[] = [];
  const log = vi.fn();
  const devPrint = vi.fn();
  return {
    sent,
    log,
    devPrint,
    mail: codeMailer({
      send: async (email) => {
        sent.push(email);
        return { error: null };
      },
      from: "BeamX <no-reply@beamx.test>",
      deployed: true,
      render: async (purpose, code) => `<p>${purpose} ${code}</p>`,
      appUrl: "https://app.beamx.test",
      log,
      devPrint,
      ...over,
    }),
  };
};

describe("codeEmailCopy", () => {
  it("names the purpose, the expiry and the ignore line", () => {
    const signUp = codeEmailText("sign-up", "123456", "https://app.beamx.test");
    expect(signUp).toContain("123456");
    expect(signUp).toContain("finish creating your account");
    expect(signUp).toContain("expires in 10 minutes");
    expect(signUp).toContain("If you didn't ask for this");
    expect(codeEmailCopy("reset", "1").subject).toBe(
      "Your BeamX password reset code",
    );
  });
});

describe("CodeEmail", () => {
  it("renders the code and the copy into HTML", async () => {
    const html = await render(
      CodeEmail({
        purpose: "reset",
        code: "654321",
        appUrl: "https://app.beamx.test",
      }),
    );
    expect(html).toContain("654321");
    expect(html).toContain("Reset your password");
    expect(html).toContain('lang="en"');
  });
});

describe("codeMailer", () => {
  it("sends HTML and plain text from the configured sender", async () => {
    const { mail, sent, log } = deps();
    expect(await mail("a@b.test", "123456", "sign-up")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sent).toEqual([
      {
        from: "BeamX <no-reply@beamx.test>",
        to: "a@b.test",
        subject: "Your BeamX sign up code",
        html: "<p>sign-up 123456</p>",
        text: codeEmailText("sign-up", "123456", "https://app.beamx.test"),
      },
    ]);
    // Logs carry no address and no code.
    expect(log).toHaveBeenCalledWith("email_sent", { purpose: "sign-up" });
  });

  it("returns email_send_failed when Resend reports an error or throws", async () => {
    const reported = deps({ send: async () => ({ error: { message: "x" } }) });
    expect(await reported.mail("a@b.test", "1", "reset")).toEqual({
      ok: false,
      error: { code: "email_send_failed" },
    });
    const threw = deps({
      send: async () => {
        throw new Error("network");
      },
    });
    expect((await threw.mail("a@b.test", "1", "reset")).ok).toBe(false);
  });

  it("prints the code in local dev with no key, and never on a deploy", async () => {
    const local = deps({ send: null, deployed: false });
    expect((await local.mail("a@b.test", "123456", "sign-up")).ok).toBe(true);
    expect(local.devPrint).toHaveBeenCalledWith(
      "[dev] sign-up code for a@b.test: 123456",
    );
    const deployed = deps({ send: null, deployed: true });
    expect((await deployed.mail("a@b.test", "123456", "sign-up")).ok).toBe(
      false,
    );
    expect(deployed.devPrint).not.toHaveBeenCalled();
  });
});
