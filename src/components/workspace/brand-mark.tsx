import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  readonly variant: "logo" | "mark";
  readonly className?: string;
};

/**
 * The BeamX logo (full lockup) or mark (the X alone), 28px tall. The logo PNG has dark blue
 * and ink text, so in the dark theme it sits on a white rounded badge; the mark reads on dark.
 */
export function BrandMark({ variant, className }: BrandMarkProps) {
  if (variant === "mark") {
    return (
      <Image
        src="/brand/mark.png"
        alt="BeamX Solutions"
        width={228}
        height={256}
        priority
        className={cn("h-7 w-auto", className)}
      />
    );
  }
  return (
    <span className={cn("rounded-md px-2 py-1 dark:bg-logo-badge", className)}>
      <Image
        src="/brand/logo.png"
        alt="BeamX Solutions"
        width={640}
        height={292}
        priority
        className="h-7 w-auto"
      />
    </span>
  );
}
