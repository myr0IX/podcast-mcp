# podcast-mcp

A remote MCP server that turns a narration script into a downloadable MP3
podcast episode. Claude writes the script, calls the `generate_podcast` tool,
and gives you back a public URL you open or download on your phone.

- TTS: Microsoft Edge TTS (free, no API key)
- Transport: MCP Streamable HTTP (works with the Claude mobile/web app as a
  custom connector)
- Output: an MP3 served over a public URL

## How it works

1. You ask Claude for a topic in the Claude app.
2. Claude writes the full narration script itself.
3. Claude calls `generate_podcast(title, script, voice)` on this server.
4. The server synthesizes an MP3, stores it, and returns a public URL.
5. You tap the URL on your phone to listen or download.

The tool returns a URL, never the raw audio bytes. That is what makes the
download reliable from the Claude app without a custom mobile app.

## Local run

```bash
npm install
npm run dev
```

The server starts on `http://localhost:3000`. The MCP endpoint is `/mcp`.

Note: localhost is fine for testing with MCP Inspector, but the Claude app
connects from Anthropic's cloud, so for real use the server must be on a public
URL (see Deploy).

## Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://localhost:3000/mcp` using the Streamable HTTP transport.

## Deploy (public URL required)

Any host that gives you a public HTTPS URL works (Fly.io, Railway, Render, a
small VPS). A Dockerfile is included.

Set these environment variables in production:

- `PUBLIC_BASE_URL` — the public URL of this server, e.g.
  `https://my-podcast.fly.dev`. Episode URLs are built from this.
- `PORT` — defaults to 3000.

Important: the `episodes/` directory holds the generated MP3s. On hosts with an
ephemeral filesystem, mount a volume or switch storage to S3/R2 (see Next
steps).

## Connect to Claude

In the Claude app: Customize → Connectors → "+" → add a custom connector with
the URL `https://YOUR-PUBLIC-URL/mcp`. Free plan allows one custom connector.

Then ask: "Fais-moi un podcast de 3 minutes sur l'histoire du protocole MCP."

## Voices

Presets in `src/tts.ts`: `fr-male`, `fr-female`, `en-male`, `en-female`.
List all available Edge voices with `new EdgeTTS().getVoices()`.

## Next steps (beyond the POC)

- Swap Edge TTS for OpenAI or ElevenLabs by replacing `src/tts.ts` only.
- Store MP3s in S3/R2 and return signed URLs instead of local files.
- Add a two-voice dialogue mode (synthesize per speaker, stitch with ffmpeg).
- Add auth (OAuth) on the connector if the URL must stay private.
