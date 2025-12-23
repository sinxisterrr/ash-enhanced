//--------------------------------------------------------------
// FILE: src/transcription/whisper.ts
// OpenAI Whisper transcription helper
//--------------------------------------------------------------

import axios from "axios";
import FormData from "form-data";
import { logger } from "../utils/logger.js";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function transcribeAudioFromUrl(
  url: string,
  filename: string,
  contentType?: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.WHISPER_MODEL || "whisper-1";

  if (!apiKey) {
    logger.warn("Whisper transcription skipped: OPENAI_API_KEY not set.");
    return null;
  }

  try {
    const audioResp = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const audioBuffer = Buffer.from(audioResp.data);
    const maxBytes = parseInt(process.env.MAX_AUDIO_ATTACHMENT_BYTES || "15000000", 10);
    if (audioBuffer.length > maxBytes) {
      logger.warn(
        `Voice note too large (${audioBuffer.length} bytes). Limit=${maxBytes}. Skipping transcription.`
      );
      return null;
    }

    const form = new FormData();
    form.append("file", audioBuffer, {
      filename: filename || "voice-note.ogg",
      contentType: contentType || "audio/ogg",
    });
    form.append("model", model);

    const resp = await axios.post(WHISPER_API_URL, form, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      timeout: 120000,
    });

    const text = resp.data?.text;
    if (typeof text === "string" && text.trim().length > 0) {
      return text.trim();
    }

    return null;
  } catch (err: any) {
    const msg = err?.response?.data
      ? JSON.stringify(err.response.data)
      : err?.message || String(err);
    logger.warn(`Whisper transcription failed: ${msg}`);
    return null;
  }
}
