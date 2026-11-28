/**
 * The 6 digit code email (spec 0009, AC-17), rendered with React Email. Email clients
 * can't read the app's CSS variables, so the BeamX brand colors from DESIGN.md are
 * written here as hex values (royal blue `#02428E`, ink `#1D1D1B`).
 */
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { EmailFooter } from "./footer";
import { codeEmailCopy, type CodePurpose } from "./copy";

const ROYAL_BLUE = "#02428E";
const INK = "#1D1D1B";
const MUTED = "#5B6472";
const SURFACE = "#F5F6F8";
const FONT = "Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif";

export function CodeEmail({
  purpose,
  code,
  appUrl,
}: {
  readonly purpose: CodePurpose;
  readonly code: string;
  /** The app URL the policy footer links to. */
  readonly appUrl: string;
}) {
  const copy = codeEmailCopy(purpose, code);
  return (
    <Html lang="en">
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={{ backgroundColor: SURFACE, fontFamily: FONT, margin: 0 }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            margin: "32px auto",
            maxWidth: 480,
            padding: 32,
          }}
        >
          <Text
            style={{
              color: ROYAL_BLUE,
              fontSize: 20,
              fontWeight: 700,
              margin: "0 0 24px",
            }}
          >
            BeamX
          </Text>
          <Heading
            as="h1"
            style={{ color: INK, fontSize: 22, fontWeight: 600, margin: 0 }}
          >
            {copy.heading}
          </Heading>
          <Text style={{ color: INK, fontSize: 16, lineHeight: "24px" }}>
            {copy.intro}
          </Text>
          <Section
            style={{
              backgroundColor: SURFACE,
              borderRadius: 8,
              margin: "8px 0 16px",
              padding: "16px 0",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                color: ROYAL_BLUE,
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: 8,
                margin: 0,
              }}
            >
              {code}
            </Text>
          </Section>
          <Text style={{ color: MUTED, fontSize: 14, lineHeight: "20px" }}>
            {copy.expiry} {copy.ignore}
          </Text>
          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}
