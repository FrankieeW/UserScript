# Command Bridge

This bridge lets the userscript trigger local command-line tools such as FDM.

## Start

```bash
BRIDGE_TOKEN="replace-this-with-a-secret" node m3u8/bridge/command-bridge.js
```

Optional environment variables:

```bash
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=3210
BRIDGE_TOKEN=replace-this-with-a-secret
```

## Userscript Settings

Set these values in the userscript settings page:

- `Bridge URL`: `http://127.0.0.1:3210`
- `Bridge Token`: same as `BRIDGE_TOKEN`

Then you can use command templates:

- Downloader template: `cmd:fdm {{rawUrl}}`
- Primary player template: `cmd:open -a IINA {{rawUrl}}`
- Secondary player template: `cmd:open -a VLC {{rawUrl}}`

Or use the built-in preset selectors in the userscript settings page and edit the generated templates.

## Template Variables

Shell-quoted variables:

- `{{rawUrl}}`
- `{{pageUrl}}`
- `{{title}}`

Literal variables:

- `{{rawUrlLiteral}}`
- `{{pageUrlLiteral}}`
- `{{titleLiteral}}`

## Health Check

```bash
curl http://127.0.0.1:3210/health
```
