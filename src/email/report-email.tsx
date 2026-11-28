/**
 * The report email (spec 0015, AC-5): the report attached as a PDF, its headline, a
 * link back to the chat, and the consultation invitation. Email clients can't read the
 * app's CSS variables, so the DESIGN.md brand colors are hex values here.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { EmailFooter } from "./footer";
import { reportEmailCopy, type ReportEmailInput } from "./report-copy";

const ROYAL_BLUE = "#02428E";
const INK = "#1D1D1B";
const MUTED = "#5B6472";
const SURFACE = "#F5F6F8";
const FONT = "Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif";

export function ReportEmail(input: ReportEmailInput) {
  const copy = reportEmailCopy(input);
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
            maxWidth: 520,
            padding: 32,
          }}
        >
          <Heading style={{ color: ROYAL_BLUE, fontSize: 22, margin: 0 }}>
            {copy.heading}
          </Heading>
          {copy.headline ? (
            <Text style={{ color: INK, fontSize: 16, fontWeight: 600 }}>
              {copy.headline}
            </Text>
          ) : null}
          <Text style={{ color: INK, fontSize: 15, lineHeight: "24px" }}>
            {copy.body}
          </Text>
          {copy.chatUrl ? (
            <Section style={{ margin: "20px 0" }}>
              <Button
                href={copy.chatUrl}
                style={{
                  backgroundColor: ROYAL_BLUE,
                  borderRadius: 8,
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "12px 20px",
                }}
              >
                {copy.button}
              </Button>
            </Section>
          ) : null}
          <Text style={{ color: MUTED, fontSize: 14, lineHeight: "22px" }}>
            {copy.consultation}
          </Text>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}
