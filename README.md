# Taste Atlas

A local desktop app for collecting examples of writing and visual design, adding positive and negative annotations, and keeping a portable profile that AI agents can read. Nothing is sent to a Taste Atlas server. A website's public page is fetched when you save a URL without pasted text or choose **Preview capture**; screenshots must be attached or pasted by you.

## Install and run

Download the installer for your operating system from the **Desktop installers** workflow's artifacts in [Actions](https://github.com/julio-am/taste-atlas/actions). macOS builds produce a DMG for Apple Silicon and a separate DMG for Intel, Windows produces a Squirrel `Setup.exe`, and Linux produces a `.deb`. The installer contains Electron and Node, so users do not need to install Node separately.

The current builds are unsigned. macOS Gatekeeper and Windows SmartScreen may warn on first launch. Code signing and macOS notarization are needed before a broad public release.

To run or build from source, install [Node.js 22.13 or newer](https://nodejs.org/) and run:

```sh
npm ci
npm start
```

`npm start` opens the native window. `npm run start:web` runs the older browser UI; the `start.command`, `start.bat`, and `start.sh` scripts do the same. The app listens only on your computer. On first run it creates a `Taste Atlas` folder inside your user `Documents` folder. Set `TASTE_ATLAS_DIR` to choose another folder. The desktop window uses a temporary local port; the browser UI defaults to port 4786 and accepts `TASTE_ATLAS_PORT`.

To make an installer on the current platform, run `npm run make`. Distributables appear under `out/make/`. The repository's workflow builds all platforms on their respective operating systems. Run `npm test` for the storage and API integration test.

Add an example with a URL, image, or pasted writing sample. Choose its type, such as **Desktop utility**, **Website**, or **Blog**. Use **Types** to create your own types, rename them, and add your own type-wide guidance. Types with examples must be emptied before deletion; renaming a type keeps its examples. A positive or negative quick note is optional. Click an attached image to pin a detailed annotation to a location. Notes apply to that type by default; choose **All types** on a detailed note only for a preference that travels across formats. The profile folder updates immediately. Paste a screenshot while an example is open, or use **Add image**. Export downloads a ZIP containing the entire profile.

## Storage format

```text
Taste Atlas/
  PROFILE.md         Human-readable index and agent guidance
  AGENTS.md          Short entry point for Codex and other agents
  CLAUDE.md          Imports AGENTS.md for Claude Code
  types.json         Editable type catalog with stable IDs and guidance
  manifest.json      Machine-readable index (schemaVersion 2)
  examples/<id>.json Structured source of truth for each example
  examples/<id>.md   Human-readable annotations and source text
  assets/<id>.png    Screenshots and images, with original bytes
```

This is a per-user folder, not a hosted database. Put it in a private sync folder or private Git repository if you want it on other machines. Back up the entire folder; the app writes JSON atomically. Older examples with a `category` field still work; `website`, `app`, `writing`, `design`, and `other` map to the included type IDs. Their older notes are type-scoped by default. A URL capture keeps a title, description, and short readable text excerpt. It does not create a visual screenshot of the page, so attach an image if the visual design matters. Some sites prevent automated text capture; you can still save the URL and screenshots.

## Use with agents

For local Codex or Claude Code, open the profile folder as a project or add a pointer in another project's `AGENTS.md` / `CLAUDE.md`: “Before user-facing writing or design, read `/path/to/Taste Atlas/PROFILE.md` and the relevant examples.” Note that agents need local file access to that path. Web chats do not automatically have that access; upload the exported ZIP or selected files to a ChatGPT or Claude project.

The installed executable has a read-only MCP mode that works while the GUI is closed. Open **Use with AI agents** in the app to copy the exact executable path. For example, on macOS after copying the app to Applications:

```sh
"/Applications/Taste Atlas.app/Contents/MacOS/taste-atlas" --mcp
```

For Codex, put this in `~/.codex/config.toml` (replace the command with your installed executable's path):

```toml
[mcp_servers.taste_atlas]
command = "/Applications/Taste Atlas.app/Contents/MacOS/taste-atlas"
args = ["--mcp"]
```

For Claude Desktop, add this server to `claude_desktop_config.json` (merge with existing settings):

```json
{
  "mcpServers": {
    "taste-atlas": {
      "command": "/Applications/Taste Atlas.app/Contents/MacOS/taste-atlas",
      "args": ["--mcp"]
    }
  }
}
```

Use the installed executable path shown in the app for Windows or Linux. If you set `TASTE_ATLAS_DIR`, pass that environment variable in the MCP server configuration too. Source checkouts can still run `node mcp-server.mjs`. The tools are `get_taste_profile`, `list_taste_types`, `search_taste_examples` (filterable by type ID), and `get_taste_example` (which can include images). They only read local data. Desktop MCP configuration is separate for each AI app.

## Security and boundaries

The GUI binds to loopback, checks the request host and origin, and does not accept remote connections. The desktop window has Node integration disabled, context isolation and sandboxing enabled, and external links open in the system browser. The URL text capture rejects common private/local addresses and limits fetch size and time; it is a convenience feature, not a general web archiver. The app stores your annotations exactly as written and does not call an AI model to infer preferences. Its files remain local and can be reused by future clients without a shared database.
