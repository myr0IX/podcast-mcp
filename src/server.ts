import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { synthesizeNarration, VOICES, DEFAULT_VOICE } from "./tts.js";

// --- Config -----------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
// Public base URL of THIS server, e.g. https://my-podcast.fly.dev
// Must be reachable from the public internet for Claude's cloud to call it.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const EPISODES_DIR = path.resolve(process.env.EPISODES_DIR ?? "./episodes");

// --- Podcast generation core ------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "episode";
}

interface GenerateArgs {
  title: string;
  script: string;
  voice?: string;
}

interface GeneratedEpisode {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  voice: string;
}

async function generateEpisode(args: GenerateArgs): Promise<GeneratedEpisode> {
  const id = `${slugify(args.title)}-${randomUUID().slice(0, 8)}`;
  const outPathNoExt = path.join(EPISODES_DIR, id);
  const voice = args.voice ?? DEFAULT_VOICE;

  const { durationSeconds } = await synthesizeNarration({
    text: args.script,
    voice,
    outPathNoExt,
  });

  return {
    id,
    title: args.title,
    url: `${PUBLIC_BASE_URL}/episodes/${id}.mp3`,
    durationSeconds,
    voice,
  };
}

// --- MCP server -------------------------------------------------------------

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "podcast-generator",
    version: "0.1.0",
  });

  server.registerTool(
    "generate_podcast",
    {
      title: "Generate a narrated podcast episode",
      description:
        "Converts a narration script into a downloadable MP3 podcast episode. " +
        "Write the full script yourself first, then pass it here. " +
        "Returns a public URL the user can open or download on their phone.",
      inputSchema: {
        title: z.string().describe("Short title of the episode, used in the filename."),
        script: z
          .string()
          .describe(
            "The complete narration text to read aloud. Plain prose, no stage directions."
          ),
        voice: z
          .enum(Object.keys(VOICES) as [string, ...string[]])
          .optional()
          .describe(`Voice preset. Defaults to ${DEFAULT_VOICE}.`),
      },
    },
    async ({ title, script, voice }) => {
      const episode = await generateEpisode({ title, script, voice });
      const mins = Math.floor(episode.durationSeconds / 60);
      const secs = episode.durationSeconds % 60;
      return {
        content: [
          {
            type: "text",
            text:
              `Episode ready: "${episode.title}"\n` +
              `Duration: ~${mins}m${secs.toString().padStart(2, "0")}s\n` +
              `Voice: ${episode.voice}\n` +
              `Download / listen: ${episode.url}`,
          },
        ],
      };
    }
  );

  return server;
}

// --- HTTP layer -------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "2mb" }));

// Serve generated mp3 files statically.
app.use(
  "/episodes",
  express.static(EPISODES_DIR, {
    setHeaders: (res) => {
      res.setHeader("Content-Type", "audio/mpeg");
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// MCP Streamable HTTP endpoint (stateless mode: one transport per request).
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless servers don't support GET/DELETE session streams.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

app.listen(PORT, async () => {
  await fs.mkdir(EPISODES_DIR, { recursive: true });
  console.log(`Podcast MCP server listening on ${PUBLIC_BASE_URL}`);
  console.log(`  MCP endpoint:   ${PUBLIC_BASE_URL}/mcp`);
  console.log(`  Episodes:       ${PUBLIC_BASE_URL}/episodes/`);
});

export { generateEpisode, isInitializeRequest };
