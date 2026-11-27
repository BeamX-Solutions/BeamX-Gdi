import { Font } from "@react-pdf/renderer";

/**
 * Register the Montserrat family.
 *
 * Web:    place the TTFs in /public/fonts and call registerFonts() (default).
 * Server: pass an absolute path or a hosted base URL, e.g.
 *         registerFonts(path.join(process.cwd(), "public/fonts"))
 *         registerFonts("https://cdn.yoursite.com/fonts")
 *
 * Safe to call more than once; the last registration wins.
 */
let done = false;

export function registerFonts(basePath = "/fonts") {
  Font.register({
    family: "Montserrat",
    fonts: [
      { src: `${basePath}/Montserrat-Light.ttf`, fontWeight: 300 },
      { src: `${basePath}/Montserrat-Regular.ttf`, fontWeight: 400 },
      { src: `${basePath}/Montserrat-Medium.ttf`, fontWeight: 500 },
      { src: `${basePath}/Montserrat-SemiBold.ttf`, fontWeight: 600 },
      { src: `${basePath}/Montserrat-Bold.ttf`, fontWeight: 700 },
      { src: `${basePath}/Montserrat-ExtraBold.ttf`, fontWeight: 800 },
      { src: `${basePath}/Montserrat-Black.ttf`, fontWeight: 900 },
    ],
  });
  // Montserrat ships clean ranges; stop react-pdf from hyphenating mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  done = true;
}

/** Register once with the default path if it hasn't happened yet. */
export function ensureFonts() {
  if (!done) registerFonts();
}
