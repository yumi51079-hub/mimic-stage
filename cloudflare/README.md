# Cloudflare Free deployment

Deploy this repository with Cloudflare Workers Builds using `npm run deploy`. Wrangler automatically provisions the D1 binding; schema initialization is idempotent on the first room API request. Build downloads and verifies all 100 sample MP3 files. HTML, sample metadata and MP3s are static assets. All room APIs and uploaded audio use D1, with no Render dependency and no R2 activation or paid plan.

Run `npm run test:cloudflare` for solo/multiplayer lifecycle and D1 audio storage checks. `npx wrangler deploy --dry-run` checks the production bundle. Audio is split into 500 KB BLOB rows and expires after two hours; room creation cleans expired audio. Production sessions do not migrate from Render. The old deployment remains available until the new one is verified.

The Workers Free and D1 Free daily usage limits apply. Stay on Free; do not enable paid plans. When limits are reached requests can fail rather than silently upgrading.
