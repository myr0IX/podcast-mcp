import { EdgeTTS } from "@andresaya/edge-tts";
import { promises as fs } from "node:fs";
import path from "node:path";

// Curated narration voices. Add more from `new EdgeTTS().getVoices()` if needed.
export const VOICES: Record<string, string> = {
  // French
  "fr-male": "fr-FR-HenriNeural",
  "fr-female": "fr-FR-DeniseNeural",
  // English
  "en-male": "en-US-AndrewNeural",
  "en-female": "en-US-AvaNeural",
};

export const DEFAULT_VOICE = "fr-male";

export interface SynthesizeOptions {
  text: string;
  // A key from VOICES, or a raw Edge voice id like "fr-FR-HenriNeural".
  voice?: string;
  // Output file path WITHOUT extension (the library appends .mp3).
  outPathNoExt: string;
}

export interface SynthesizeResult {
  filePath: string;
  durationSeconds: number;
}

/**
 * Synthesizes narration audio to an mp3 file using Microsoft Edge TTS (free, no API key).
 * Returns the final file path and an estimated duration.
 */
export async function synthesizeNarration(
  opts: SynthesizeOptions
): Promise<SynthesizeResult> {
  const voiceId = VOICES[opts.voice ?? DEFAULT_VOICE] ?? opts.voice ?? VOICES[DEFAULT_VOICE];

  const tts = new EdgeTTS();
  await tts.synthesize(opts.text, voiceId, {
    rate: "0%",
    volume: "0%",
    pitch: "0Hz",
  });

  await tts.toFile(opts.outPathNoExt);
  const filePath = `${opts.outPathNoExt}.mp3`;

  // Best-effort duration; library exposes getDuration() after synthesis.
  let durationSeconds = 0;
  try {
    durationSeconds = Math.round((tts.getDuration?.() as number) ?? 0);
  } catch {
    durationSeconds = 0;
  }

  // Sanity check that the file actually exists.
  await fs.access(filePath);
  return { filePath: path.resolve(filePath), durationSeconds };
}
