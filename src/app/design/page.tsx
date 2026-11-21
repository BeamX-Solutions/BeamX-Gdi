import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  OctagonXIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatGallery } from "@/components/workspace/chat-gallery";
import { ReportGallery } from "@/components/workspace/report-gallery";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Design system · BeamX Workspace",
  robots: { index: false, follow: false },
};

/** Every foreground on its background, so the axe scan sees each pair (spec 0003). */
const pairs: readonly { name: string; classes: string }[] = [
  {
    name: "foreground on background",
    classes: "bg-background text-foreground",
  },
  { name: "card-foreground on card", classes: "bg-card text-card-foreground" },
  {
    name: "popover-foreground on popover",
    classes: "bg-popover text-popover-foreground",
  },
  {
    name: "secondary-foreground on secondary",
    classes: "bg-secondary text-secondary-foreground",
  },
  {
    name: "muted-foreground on muted",
    classes: "bg-muted text-muted-foreground",
  },
  {
    name: "muted-foreground on background",
    classes: "bg-background text-muted-foreground",
  },
  {
    name: "primary-foreground on primary",
    classes: "bg-primary text-primary-foreground",
  },
  {
    name: "accent-foreground on accent",
    classes: "bg-accent text-accent-foreground",
  },
  { name: "primary on background", classes: "bg-background text-primary" },
  {
    name: "destructive on background",
    classes: "bg-background text-destructive",
  },
  {
    name: "verdict-good-foreground on verdict-good",
    classes: "bg-verdict-good text-verdict-good-foreground",
  },
  {
    name: "verdict-good-strong on verdict-good-muted",
    classes: "bg-verdict-good-muted text-verdict-good-strong",
  },
  {
    name: "verdict-caution-foreground on verdict-caution",
    classes: "bg-verdict-caution text-verdict-caution-foreground",
  },
  {
    name: "verdict-caution-strong on verdict-caution-muted",
    classes: "bg-verdict-caution-muted text-verdict-caution-strong",
  },
  {
    name: "verdict-risk-foreground on verdict-risk",
    classes: "bg-verdict-risk text-verdict-risk-foreground",
  },
  {
    name: "verdict-risk-strong on verdict-risk-muted",
    classes: "bg-verdict-risk-muted text-verdict-risk-strong",
  },
];

const decoration: readonly { name: string; classes: string }[] = [
  { name: "border", classes: "bg-border" },
  { name: "input", classes: "bg-input" },
  { name: "ring", classes: "bg-ring" },
  { name: "brand-sky", classes: "bg-brand-sky" },
  { name: "brand-orange", classes: "bg-brand-orange" },
];

const typeScale: readonly { name: string; classes: string }[] = [
  { name: "text-xs · 12px", classes: "text-xs" },
  { name: "text-sm · 14px", classes: "text-sm" },
  { name: "text-base · 16px", classes: "text-base" },
  { name: "text-lg · 18px", classes: "text-lg" },
  { name: "text-xl · 20px", classes: "text-xl" },
  { name: "text-2xl · 24px", classes: "text-2xl" },
  { name: "text-3xl · 30px", classes: "text-3xl" },
  { name: "text-4xl · 36px", classes: "text-4xl" },
];

// The three weights the design uses, all Montserrat (AC-16).
const weights: readonly { name: string; classes: string }[] = [
  { name: "Regular 400 · body and chat replies", classes: "font-normal" },
  { name: "Medium 500 · labels and buttons", classes: "font-medium" },
  { name: "Semibold 600 · headings and titles", classes: "font-semibold" },
];

const verdicts: readonly {
  label: string;
  Icon: LucideIcon;
  classes: string;
}[] = [
  {
    label: "Good",
    Icon: CheckCircle2Icon,
    classes: "bg-verdict-good-muted text-verdict-good-strong",
  },
  {
    label: "Caution",
    Icon: AlertTriangleIcon,
    classes: "bg-verdict-caution-muted text-verdict-caution-strong",
  },
  {
    label: "Risk",
    Icon: OctagonXIcon,
    classes: "bg-verdict-risk-muted text-verdict-risk-strong",
  },
];

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  if (!env.ENABLE_DESIGN_PAGE) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-4 md:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold wrap-anywhere">
            BeamX design system
          </h1>
          <p className="mt-2 text-muted-foreground">
            Every token and shared component, on fixture data. Written up in
            DESIGN.md.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section id="colors" title="Color pairs">
        <ul className="grid gap-3 sm:grid-cols-2">
          {pairs.map((pair) => (
            <li
              key={pair.name}
              className={`min-w-0 rounded-lg border p-4 text-sm font-medium wrap-anywhere ${pair.classes}`}
            >
              {pair.name}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-3" aria-label="Decoration tokens">
          {decoration.map((swatch) => (
            <li key={swatch.name} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={`size-6 rounded-md border ${swatch.classes}`}
              />
              {swatch.name}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="verdicts" title="Verdicts">
        <ul className="flex flex-wrap gap-3">
          {verdicts.map(({ label, Icon, classes }) => (
            <li
              key={label}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${classes}`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Type scale">
        <p className="text-sm text-muted-foreground">
          Montserrat, the BeamX brand font, for all text.
        </p>
        <ul className="flex flex-col gap-2">
          {weights.map((w) => (
            <li key={w.name} className={`text-base ${w.classes}`}>
              {w.name}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-2">
          {typeScale.map((step) => (
            <li key={step.name} className={step.classes}>
              {step.name} · The quick brown fox
            </li>
          ))}
        </ul>
        <p className="font-mono text-sm text-muted-foreground">
          Geist Mono for code and numbers.
        </p>
      </Section>

      <Section id="buttons" title="Buttons and badges">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      <Section id="shell" title="Workspace shell">
        <p className="text-muted-foreground">
          The header, history rail, chat column, and report panel (or sheet on
          phones), on fixture data.
        </p>
        <Button asChild className="self-start">
          <Link href="/design/shell">Open the shell demo</Link>
        </Button>
      </Section>

      <Section id="chat" title="Chat thread, composer, and answer cards">
        <ChatGallery />
      </Section>

      <Section id="report" title="Report parts and error cards">
        <ReportGallery />
      </Section>

      <Section id="surfaces" title="Card and skeleton">
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Cards sit on the card token.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </Section>
    </main>
  );
}
