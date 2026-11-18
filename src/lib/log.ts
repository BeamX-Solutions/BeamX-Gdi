/** One structured log line: an event name plus ids and counts. Never content or secrets. */
export const logEvent = (
  event: string,
  fields: Readonly<Record<string, string | number | boolean | null>>,
): void => {
  console.info(JSON.stringify({ event, ...fields }));
};
