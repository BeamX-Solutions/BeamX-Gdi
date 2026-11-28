/**
 * "Download my data" (spec 0017, AC-7, AC-8): fetches the export and saves it under the
 * file name the server gives. Expected failures come back as a message for the toast,
 * never a raw error page.
 */
export const EXPORT_PATH = "/api/account/export";
export const DOWNLOAD_LABEL = "Download my data";
export const DOWNLOAD_STARTED = "Your data is downloading.";
/** How long the downloaded file's blob URL stays alive. */
export const REVOKE_AFTER_MS = 30_000;

/** The toast for a failed export, by HTTP status. Pure. */
export const downloadErrorMessage = (status: number): string => {
  switch (status) {
    case 401:
      return "Send a message first. There's no data to download yet.";
    case 429:
      return "You've downloaded your data a few times this hour. Try again later.";
    default:
      return "We couldn't prepare your data. Try again.";
  }
};

/** The file name from `Content-Disposition`, or a dated fallback. Pure. */
export const fileNameFrom = (
  disposition: string | null,
  today: string,
): string =>
  disposition?.match(/filename="([^"]+)"/)?.[1] ?? `beamx-data-${today}.json`;

/** Runs the download in the browser; the message to show either way. */
export const downloadMyData = async (): Promise<string> => {
  try {
    const response = await fetch(EXPORT_PATH, { cache: "no-store" });
    if (!response.ok) return downloadErrorMessage(response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameFrom(
      response.headers.get("Content-Disposition"),
      new Date().toISOString().slice(0, 10),
    );
    document.body.append(link);
    link.click();
    link.remove();
    // Some browsers start the save after `click()` returns; freeing the file at once
    // can cancel it, so the blob URL is released later.
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    return DOWNLOAD_STARTED;
  } catch {
    return downloadErrorMessage(0);
  }
};
