# TasteMate installation website

Static installation flow for gettastemate.com. No framework, build step, account system, analytics, or user database. `dist/` is the complete public site. Source is also maintained in `website/` in julio-am/taste-atlas alongside the companion extension.

The production hosting target is Cloudflare Pages in the owner's account, with GitHub Releases serving installers and the Chrome Web Store serving the extension. The earlier ChatGPT Sites deployment is a separate private preview; its `.openai/hosting.json` and DNS records do not configure Cloudflare Pages. Domain registration remains at Squarespace.

## Deploy to Cloudflare Pages

In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** (also labeled **Import an existing Git repository**). Authorize the Cloudflare GitHub app for `julio-am/taste-atlas` and use these settings:

| Setting | Value |
| --- | --- |
| Project name | `gettastemate` if available |
| Production branch | `feature/website-installation` until the website is merged into `main` |
| Framework preset | None |
| Root directory | `website` |
| Build command | `exit 0` |
| Build output directory | `dist` |
| Build environment variable | `SKIP_DEPENDENCY_INSTALL=true` |

The output directory is relative to the configured root. The site is already built and committed; it needs no npm dependencies, Electron build, API token, or backend service. Skipping dependency installation prevents the desktop project's dependencies from being installed unnecessarily. Apply that variable to production and preview builds.

Select **Save and Deploy**, then open the actual `*.pages.dev` URL Cloudflare returns. The page and privacy link should load. The connection check requires one of the exact supported origins listed below; the temporary Pages hostname is not allowed to contact the extension. Validate the native connection on `https://gettastemate.com` after connecting the domain.

Cloudflare deploys later commits to the selected production branch automatically. After the website is merged into `main`, change the production branch to `main`. Follow [DNS.md](DNS.md) to connect the custom domains. Download/store buttons remain unavailable until real releases are configured below.

Official references: [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), and [skip dependency installation](https://developers.cloudflare.com/pages/configuration/build-image/#skip-dependency-install).

## Release configuration

`dist/releases.json` is the single reviewed source of download and store availability. Empty downloads and a null store URL intentionally show an unavailable state. Never point a public button to Actions artifacts, an unsigned Mac/Windows build, an unpacked extension, or a guessed release URL. No click on a download link is treated as a completed installation.

After publishing real signed installers to GitHub Releases, add entries keyed by `macos-arm64`, `macos-x64`, `windows-x64`, or `linux-x64`. Each entry requires:

- `url`: exact HTTPS asset URL under `github.com/julio-am/taste-atlas/releases/download/<tag>/<asset>`.
- `version`: software version, such as `0.4.1`.
- `sizeBytes`: actual file size as a positive integer.
- `sha256`: actual lowercase SHA-256 of the uploaded installer.
- `signed: true`: required for Mac and Windows, based on release verification.
- `notarized: true`: required for Mac, based on the Gatekeeper/notarization checks.

These flags record verified release facts; the website does not independently verify a binary's signature. Run `node scripts/configure-website.mjs --release <published-tag>` in the app repository to validate and import an attached `tastemate-release.json` manifest after its public artifacts are present. The command verifies the downloaded bytes and metadata before enabling links; publisher signing checks must have run before attaching that manifest.

Set `extension.id` and `extension.storeUrl` together only after store publication. The store URL must end with the same 32-character ID. Add that production ID to the desktop native helper's allowed origins when making the production app. `extension.checkIds` allows existing development installs to use the connection check; it does not create a store link.

Republish the site after changing release configuration. There is no background polling service or scheduled task.

## Connection check

Extension 0.4.1 adds a single external status message from these exact HTTPS origins:

- `https://gettastemate.com`
- `https://www.gettastemate.com`
- `https://gettastemate.jcmcoding.chatgpt.site`

The website sends `{ "type": "tastemate.setup.status", "protocolVersion": 1 }` on a button click. It receives only connection status and software versions. The extension checks the sender origin/frame, disallows other message types, and never exposes the native helper as a general website API. It returns no file paths, categories, screenshots, annotations, or raw native errors. There is no localhost port scanning, custom URL handler, or auto-launch loop.

The check distinguishes unsupported browser, missing/old extension, disconnected desktop helper, timeout, and a real successful connection. Extension detection is per Chrome profile. macOS architecture is inferred only if user-agent client hints explicitly supply it; a generic “Intel Mac” user agent never selects the Intel installer.

## Validation

The app repository's Node tests validate release gating, connection outcomes/timeouts, and the external message security boundary. Its Chromium acceptance workflow also visits this site through an HTTPS test route and checks the actual extension-to-native connection. The live preview must never be represented as a public download launch until signed releases and the store listing exist.

Optional WebMCP tools expose installer selection and the existing availability/last-check state in browsers implementing `document.modelContext`. The website works without them.
