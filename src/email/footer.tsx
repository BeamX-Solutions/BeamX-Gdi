/**
 * The policy footer of every email (spec 0017, AC-4). Hex colors, since email clients
 * can't read the app's CSS variables.
 */
import { Hr, Link, Text } from "@react-email/components";
import { FOOTER_LEAD, policyUrls } from "./footer-copy";

const MUTED = "#5B6472";

export function EmailFooter({ appUrl }: { readonly appUrl: string }) {
  const urls = policyUrls(appUrl);
  const link = { color: MUTED, textDecoration: "underline" };
  return (
    <>
      <Hr style={{ borderColor: "#E3E6EA", margin: "24px 0 12px" }} />
      <Text
        style={{ color: MUTED, fontSize: 12, lineHeight: "18px", margin: 0 }}
      >
        {FOOTER_LEAD} ·{" "}
        <Link href={urls.privacy} style={link}>
          Privacy notice
        </Link>{" "}
        ·{" "}
        <Link href={urls.terms} style={link}>
          Terms of use
        </Link>
      </Text>
    </>
  );
}
