/**
 * The email BeamX gets for each booking or cancel (spec 0016, AC-6, AC-7). Email clients
 * can't read the app's CSS variables, so the DESIGN.md brand colors are hex values here.
 */
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import {
  consultationEmailCopy,
  type ConsultationEmailInput,
} from "./consultation-copy";

const ROYAL_BLUE = "#02428E";
const INK = "#1D1D1B";
const MUTED = "#5B6472";
const SURFACE = "#F5F6F8";
const FONT = "Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif";

const line = { color: INK, fontSize: 15, lineHeight: "24px", margin: 0 };
const title = {
  color: MUTED,
  fontSize: 13,
  fontWeight: 600,
  margin: "20px 0 4px",
};

export function ConsultationEmail(input: ConsultationEmailInput) {
  const copy = consultationEmailCopy(input);
  return (
    <Html lang="en">
      <Head />
      <Preview>{copy.subject}</Preview>
      <Body style={{ backgroundColor: SURFACE, fontFamily: FONT, margin: 0 }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 12,
            margin: "32px auto",
            maxWidth: 560,
            padding: 32,
          }}
        >
          <Heading
            style={{ color: ROYAL_BLUE, fontSize: 22, margin: "0 0 16px" }}
          >
            {copy.heading}
          </Heading>
          {copy.lines.map((l) => (
            <Text key={l} style={line}>
              {l}
            </Text>
          ))}
          {input.kind === "booked" ? (
            <>
              {copy.profile.length > 0 ? (
                <>
                  <Text style={title}>{copy.profileTitle}</Text>
                  {copy.profile.map((l) => (
                    <Text key={l} style={line}>
                      {l}
                    </Text>
                  ))}
                </>
              ) : null}
              <Text style={title}>{copy.reportsTitle}</Text>
              {copy.reports.map((l) => (
                <Text key={l} style={line}>
                  {l}
                </Text>
              ))}
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
