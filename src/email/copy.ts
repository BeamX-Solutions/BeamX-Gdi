/**
 * The words of the 6 digit code emails (spec 0009, AC-17). Pure, so the template and the
 * plain text version always say the same thing.
 */

/** Why a code was sent: creating an account, or resetting a password. */
export type CodePurpose = "sign-up" | "reset";

/** Minutes a code stays valid (`emailOTP` `expiresIn: 600`). */
export const CODE_MINUTES = 10;

export type CodeEmailCopy = {
  readonly subject: string;
  readonly preview: string;
  readonly heading: string;
  readonly intro: string;
  readonly expiry: string;
  readonly ignore: string;
};

const PURPOSE: Readonly<
  Record<CodePurpose, Pick<CodeEmailCopy, "subject" | "heading" | "intro">>
> = {
  "sign-up": {
    subject: "Your BeamX sign up code",
    heading: "Finish creating your account",
    intro: "Enter this code in BeamX to finish creating your account:",
  },
  reset: {
    subject: "Your BeamX password reset code",
    heading: "Reset your password",
    intro: "Enter this code in BeamX to choose a new password:",
  },
};

export const codeEmailCopy = (
  purpose: CodePurpose,
  code: string,
): CodeEmailCopy => ({
  ...PURPOSE[purpose],
  preview: `${code} is your BeamX code`,
  expiry: `This code expires in ${CODE_MINUTES} minutes.`,
  ignore: "If you didn't ask for this, you can ignore this email.",
});

/** The plain text version, for mail apps that don't show HTML. */
export const codeEmailText = (purpose: CodePurpose, code: string): string => {
  const c = codeEmailCopy(purpose, code);
  return [
    c.heading,
    "",
    c.intro,
    "",
    code,
    "",
    c.expiry,
    c.ignore,
    "",
    "BeamX",
  ].join("\n");
};
