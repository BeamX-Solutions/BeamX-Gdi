type TimelineStep = {
  readonly label: string;
  readonly items: readonly string[];
};

/** Ordered steps (for example weeks), each with a short list of tasks. Plain text only. */
export function TimelineList({
  steps,
  label,
}: {
  readonly steps: readonly TimelineStep[];
  readonly label: string;
}) {
  return (
    <ol aria-label={label} className="flex flex-col gap-4">
      {steps.map((step, index) => (
        <li
          key={`${index}-${step.label}`}
          className="flex min-w-0 flex-col gap-1.5 border-l-2 border-primary pl-4"
        >
          <p className="font-medium wrap-anywhere">{step.label}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {step.items.map((item, i) => (
              <li key={i} className="wrap-anywhere">
                {item}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
