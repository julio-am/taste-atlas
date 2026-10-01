# TasteMate

A local desktop app and browser companion for collecting examples of writing and visual design, adding positive and negative annotations, and keeping a portable profile that AI agents can read. Nothing is sent to a TasteMate server. Capture screenshots or selected text from Chrome/Edge, attach your own images, or fetch a public page's text using **Preview capture** in the desktop app.

## Install and run

Download the installer for your operating system from the **Desktop installers** workflow's artifacts in [Actions](https://github.com/julio-am/taste-atlas/actions). macOS builds produce a DMG for Apple Silicon and a separate DMG for Intel, Windows produces a Squirrel `Setup.exe`, and Linux produces a `.deb`. The installer contains Electron and Node, so users do not need to install Node separately.

Older Taste Atlas Mac artifacts were unsigned, so Gatekeeper may report that they are **damaged and cannot be opened**. New Mac installers are published only after Developer ID signing, Apple notarization, and verification of the app copied out of the DMG. Windows SmartScreen may still warn because the Windows installer is unsigned.

For personal testing of an older unsigned build downloaded from this repository's Actions workflow, first check that the ZIP's SHA-256 matches the artifact digest shown by GitHub. Unzip it, open the DMG, and copy `Taste Atlas.app` to Applications. If macOS then blocks this *verified* copy, you can remove quarantine from only this app and launch it:

```sh
xattr -dr com.apple.quarantine "/Applications/Taste Atlas.app"
open "/Applications/Taste Atlas.app"
```

This is a local testing workaround for an unsigned build. Do not use it for a copy whose source or digest you cannot verify. It does not disable Gatekeeper system-wide. Use a new signed and notarized build to avoid this step.

### Enable signed macOS installers

The **Desktop installers** workflow requires five repository secrets before it will publish another Mac DMG. Until they are configured, it skips signed Mac publishing; the separate **Mac packaging check** still builds and launches an unsigned app on a Mac runner without uploading it. An Apple Developer Program membership alone is insufficient: export your **Developer ID Application** certificate **with its private key** as a password-protected `.p12`, and create a **Team** App Store Connect API key (`.p8`) for notarization. Do not commit either file or paste them into an issue or chat.

In the repository's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | Base64 text of the `.p12` export |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_API_KEY_P8_BASE64` | Base64 text of the App Store Connect Team `.p8` key |
| `APPLE_API_KEY_ID` | The key's 10-character ID |
| `APPLE_API_ISSUER_ID` | The Team key's issuer UUID |

On a Mac, `base64 -i /path/to/certificate.p12 | pbcopy` copies the certificate value; repeat with the `.p8` file for its secret. Check the certificate and private key in Keychain Access or run `security find-identity -v -p codesigning` and look for **Developer ID Application**. After adding the secrets, use **Actions → Desktop installers → Run workflow**. The Mac jobs import the certificate into a temporary keychain, sign the app with hardened runtime, submit it to Apple for notarization, and check its signature, stapled ticket, and Gatekeeper assessment after copying it from the finished DMG. If any step fails, no Mac artifact is uploaded. The Windows and Linux jobs do not use these secrets.

To run or build from source, install [Node.js 22.13 or newer](https://nodejs.org/) and run:

```sh
npm ci
npm start
```

`npm start` opens the native window. `npm run start:web` runs the older browser UI; the `start.command`, `start.bat`, and `start.sh` scripts do the same. The app listens only on your computer. New profiles live in `Documents/TasteMate`. If you already have a profile in `Documents/Taste Atlas`, TasteMate continues using that folder so existing agent links and annotations still work; it does not move or copy your data. The exact path is shown in **Use with AI agents**. Set `TASTEMATE_DIR` to choose another folder (`TASTE_ATLAS_DIR` remains an alias); the browser UI accepts `TASTEMATE_PORT` or the old `TASTE_ATLAS_PORT` and defaults to port 4786.

To make an installer on the current platform, run `npm run make`. Distributables appear under `out/make/`. On a Mac this packages the app with Forge, creates a ZIP, and uses Apple's `hdiutil` to make the DMG; it does not need a Developer ID certificate for local testing. The repository's workflow builds all platforms on their respective operating systems and requires signing credentials before publishing its Mac artifacts. Run `npm test` for the storage and API integration test. If you previously ran `npm audit fix --force` in a checkout, pull these changes and run `npm ci` to restore the repository's reviewed lockfile.

Add an example with a URL, image, or pasted writing sample. Choose its type, such as **Desktop utility**, **Website**, or **Blog**. Use **Types** to create your own types, rename them, and add your own type-wide guidance. Types with examples must be emptied before deletion; renaming a type keeps its examples. A positive or negative quick note is optional. Click an attached image to pin a detailed annotation to a location. Notes apply to that type by default; choose **All types** on a detailed note only for a preference that travels across formats. The profile folder updates immediately. Paste a screenshot while an example is open, or use **Add image**. Export downloads a ZIP containing the entire profile.

## Browser extension (Chrome and Edge)

Version 0.4 adds **TasteMate Capture**. This first version is loaded manually; it is not yet published in the browser stores.

1. Open the desktop app and choose **Browser extension** in the sidebar.
2. Choose Chrome or Edge and click **Connect**. TasteMate registers a per-user native messaging helper and copies the extension to a stable folder outside the application bundle.
3. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and click **Load unpacked**. Select the folder shown in TasteMate (use **Copy path** or **Open folder**).
4. Pin **TasteMate Capture**. On a website, click it or press **Alt/Option + Shift + T** to capture the visible page. Choose **Selected area** and drag on the preview to crop; **Expand** opens a larger editor. Keyboard users can enter crop coordinates as percentages.
5. Choose an existing type, write **What works** and/or **What to avoid**, and save. At least one note is required. Custom types and their descriptions come from the desktop library.

For writing, select a passage on a page, right-click, and choose **Save selection to TasteMate**. The editor also offers **Selected text** when text was selected before a screenshot capture. The source URL, capture timestamp, and selected passage are preserved. Notes apply to the chosen type; refine their scope, strength, or image pins later in the desktop app.

**The main app window can be closed while capturing.** Chrome/Edge starts the small native helper using the installed app's bundled runtime. Clicking **View in TasteMate** opens the saved example. Keep the desktop app installed; after moving it, open it once to refresh helper paths. After an update, click **Reload** on the browser extension card. A source checkout must also stay in place when connected through `npm start`.

### Drafts, privacy, and current limits

- Capture happens only after clicking the extension, using its shortcut, or invoking its selection menu. The extension has no persistent permission to read every website and does not make network requests.
- An unfinished capture is stored in the browser profile's IndexedDB. Closing the popup preserves it; reopening resumes it. One active draft is supported. Saving retains a small confirmation until **Done**. Discarding a draft removes its screenshot and notes from the extension.
- The screenshot and annotations move into the desktop profile as an image plus structured JSON and Markdown. The extension clears the draft image after a successful save. Browser data is per browser profile; saved examples live in the current operating-system user's TasteMate folder.
- Native messaging allows only the connected extension IDs. The browser helper exposes capture, type lookup, and opening an existing example; it does not expose arbitrary files or shell commands. No listening extension port, account, hosted database, model API, or telemetry is required.
- A disconnected helper leaves the draft intact. Reconnect from the desktop app and retry. If a reply is lost after saving, the exact persisted request is retried with the same ID, preventing duplicate examples. A filesystem lock coordinates desktop, MCP startup, and browser writes.
- Screenshots cover the **visible viewport**, with an optional crop; full-page stitching, video, Safari, and Firefox are not included. Captures are limited to ordinary HTTP/HTTPS pages. Browser settings, local files, and extension-store pages may block capture.
- Text is limited to 20,000 characters and each image to 12 MB. Screenshot capture is JPEG; cropped areas are saved as PNG. Screenshot mode reads selected text in the main frame; use the selection context menu for text in embedded frames. No OCR or automatic AI interpretation is performed.
- The native connection lets multiple browser profiles/extensions authorized by the same user access that user's desktop library. It does not isolate libraries by browser account. Separate OS accounts have separate libraries.

### Development and verification

`npm test` checks the HTTP library workflow, native framing, origin rejection, capture validation, retry recovery, concurrent writers, custom types, and MCP access to saved images. `npm run package && node scripts/smoke-packaged.mjs` checks both MCP and capture through the bundled runtime, including the native launcher and ASAR imports. CI runs these on Linux, Windows, and macOS (Mac checks also launch the GUI).

`npm run extension:build` produces `out/extension/tastemate-capture-0.4.0.zip` with `manifest.json` at its root. The **Browser capture check** workflow uploads the same archive. Unzip it before choosing **Load unpacked**, and still connect the desktop helper. The manifest contains a public key to keep its development ID stable; it contains no private signing key. Browser-store publication and store IDs can be configured as a later release step.

## Installation website

The installation page for **gettastemate.com** is maintained in `website/` and ready for static hosting on Cloudflare Pages. It guides desktop installation, Chrome Web Store installation, and an explicit connection check. Public download buttons stay unavailable until verified installer assets and a published extension listing are configured; development workflow artifacts are not offered to ordinary visitors.

Extension **0.4.1** adds the website connection check. Update/reload a development copy to use it. Only the exact setup website origins can request it, and the response contains connection status and versions, never profile paths or library content. Earlier desktop 0.4 builds work with the new extension. Existing desktop **Browser extension → Chrome → Connect** setup is still required.

See [website/README.md](website/README.md) for publishing, release configuration, and DNS setup. `node scripts/configure-website.mjs --release <published-tag>` verifies installer asset sizes and SHA-256 hashes before enabling public download links. The automated browser check also tests the website's real native connection and disconnected-helper recovery.

## Storage format

```text
TasteMate/
  PROFILE.md         Human-readable index and agent guidance
  AGENTS.md          Short entry point for Codex and other agents
  CLAUDE.md          Imports AGENTS.md for Claude Code
  types.json         Editable type catalog with stable IDs and guidance
  manifest.json      Machine-readable index (schemaVersion 2)
  examples/<id>.json Structured source of truth for each example
  examples/<id>.md   Human-readable annotations and source text
  assets/<id>.png    Screenshots and images, with original bytes
```

This is a per-user folder, not a hosted database. Back up the entire folder; the app writes JSON atomically. If you sync it between computers, avoid editing the same library simultaneously on different machines: the filesystem lock coordinates local processes, not distributed sync conflicts. Older examples with a `category` field still work; `website`, `app`, `writing`, `design`, and `other` map to the included type IDs. Their older notes are type-scoped by default. The desktop's URL text capture keeps a title, description, and short excerpt; use the browser extension or attach an image when the visual design matters. Browser examples also store their capture mode and retry identity in the JSON record.

## Use with agents

For local Codex or Claude Code, open the profile folder as a project or add a pointer in another project's `AGENTS.md` / `CLAUDE.md`: “Before user-facing writing or design, read `/path/to/TasteMate/PROFILE.md` and the relevant examples.” Use the actual path displayed by the app if you have an older profile folder. Agents need local file access to that path. Web chats do not automatically have that access; upload the exported ZIP or selected files to a ChatGPT or Claude project.

The installed app includes a read-only MCP server that works while the GUI is closed. Open **Use with AI agents** in the app to copy the exact command, arguments, and any required environment. On macOS after copying the app to Applications, the command is:

```sh
"/Applications/TasteMate.app/Contents/MacOS/tastemate" --mcp
```

For Codex, put this in `~/.codex/config.toml` (replace the command with your installed executable's path):

```toml
[mcp_servers.tastemate]
command = "/Applications/TasteMate.app/Contents/MacOS/tastemate"
args = ["--mcp"]
```

For Claude Desktop, add this server to `claude_desktop_config.json` (merge with existing settings):

```json
{
  "mcpServers": {
    "tastemate": {
      "command": "/Applications/TasteMate.app/Contents/MacOS/tastemate",
      "args": ["--mcp"]
    }
  }
}
```

On Windows, use the executable and bundled `resources/app.asar/mcp-server.mjs` path shown by the app, with `ELECTRON_RUN_AS_NODE=1` in the MCP server's environment. The Windows GUI executable alone does not provide a stdio connection. On Linux, use its installed executable with `--mcp`. If you set `TASTEMATE_DIR`, pass that environment variable in the MCP server configuration too. Source checkouts can still run `node mcp-server.mjs`. The tools are `get_taste_profile`, `list_taste_types`, `search_taste_examples` (filterable by type ID), and `get_taste_example` (which can include images). They only read local data. Update an existing Codex or Claude Desktop MCP command to the new TasteMate executable after installing the renamed app. The older app may then be removed without deleting its profile folder.

## Security and boundaries

The GUI binds to loopback, checks the request host and origin, and does not accept remote connections. The desktop window has Node integration disabled, context isolation and sandboxing enabled, and external links open in the system browser. The URL text capture rejects common private/local addresses and limits fetch size and time; it is a convenience feature, not a general web archiver. The app stores your annotations exactly as written and does not call an AI model to infer preferences. Its files remain local and can be reused by future clients without a shared database.
