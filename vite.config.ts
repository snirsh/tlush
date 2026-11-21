import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// When deployed to GitHub Pages at https://<user>.github.io/<repo>/ the app is
// served from a sub-path. Set BASE_PATH in CI to that sub-path (e.g. "/repo/").
// Locally and for user/org pages it defaults to "/".
const base = process.env.BASE_PATH ?? "/";

/** The self-hosted font files the first viewport renders with. */
const ABOVE_THE_FOLD_FONTS = ["manrope-latin-var", "ibm-plex-mono-latin-500"];

/**
 * Preload the above-the-fold fonts by their fingerprinted build names, under
 * `base`. Fails the build if a file is renamed so a preload can't silently go stale.
 */
function preloadFonts(): Plugin {
  let base = "/";
  return {
    name: "tlush:preload-fonts",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(_html, ctx) {
      const files = Object.keys(ctx.bundle ?? {});
      return ABOVE_THE_FOLD_FONTS.map((font) => {
        const file = files.find((f) => new RegExp(`^assets/${font}-[\\w-]+\\.woff2$`).test(f));
        if (!file) throw new Error(`preload-fonts: no built asset for ${font}.woff2`);
        return {
          tag: "link",
          attrs: { rel: "preload", as: "font", type: "font/woff2", href: `${base}${file}`, crossorigin: true },
          injectTo: "head",
        };
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), preloadFonts()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
