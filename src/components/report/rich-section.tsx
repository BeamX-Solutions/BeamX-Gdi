import type { RichLine, RichPart } from "./types";

function Line({ line }: { readonly line: RichLine }) {
  return (
    <>
      {line.lead === undefined ? null : (
        <strong className="font-semibold">{line.lead} </strong>
      )}
      {line.text}
    </>
  );
}

/** One part, as text nodes only: never HTML, never markdown (spec 0010, AC-11). */
function Part({ part }: { readonly part: RichPart }) {
  switch (part.kind) {
    case "paragraph":
      return (
        <p className="wrap-anywhere">
          <Line line={part} />
        </p>
      );
    case "note":
      return (
        <p className="wrap-anywhere text-muted-foreground italic">
          {part.text}
        </p>
      );
    case "label":
      return <p className="font-semibold wrap-anywhere">{part.text}</p>;
    case "subheading":
      return <h4 className="pt-2 font-semibold wrap-anywhere">{part.text}</h4>;
    case "bullets":
      return (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {part.items.map((item, index) => (
            <li key={index} className="wrap-anywhere">
              <Line line={item} />
            </li>
          ))}
        </ul>
      );
    case "numbered":
      return (
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          {part.items.map((item, index) => (
            <li key={index} className="wrap-anywhere">
              <Line line={item} />
            </li>
          ))}
        </ol>
      );
    case "rule":
      return <hr className="border-border" />;
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
}

/**
 * A written report section made of typed parts (Beacon's advisory). `tight` parts sit
 * close under the part before them; the rest get the usual gap.
 */
export function RichSection({
  title,
  parts,
}: {
  readonly title: string;
  readonly parts: readonly RichPart[];
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col">
      <h3 className="text-lg font-semibold wrap-anywhere">{title}</h3>
      {parts.map((part, index) => (
        <div
          key={`${index}-${part.kind}`}
          className={part.tight ? "mt-1" : "mt-3"}
          data-part={part.kind}
        >
          <Part part={part} />
        </div>
      ))}
    </section>
  );
}
