import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handle } from "./api/quote";
import { fixtureYahoo } from "./e2e/fixtures/yahoo";

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

/**
 * Serves `<base>api/quote` from the same handler Vercel deploys, under
 * `vite dev` and `vite preview`, so the lookup works locally without Vercel.
 * TLUSH_YAHOO_FIXTURES=1 (the e2e server) swaps Yahoo for a local fixture.
 */
function apiQuote(): Plugin {
  const upstream = process.env.TLUSH_YAHOO_FIXTURES === "1" ? fixtureYahoo : fetch;
  const middleware =
    (path: string): Connect.NextHandleFunction =>
    (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== path) return next();
      if (req.method !== "GET") {
        res.statusCode = 405;
        return res.end();
      }
      handle(new Request(url), upstream).then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      }, next);
    };
  return {
    name: "tlush:api-quote",
    configureServer(server) {
      server.middlewares.use(middleware(`${server.config.base}api/quote`));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(`${server.config.base}api/quote`));
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), preloadFonts(), apiQuote()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
