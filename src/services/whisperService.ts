//--------------------------------------------------------------
// FILE: src/services/whisperService.ts
// Whisper Service - Speech-to-Text using OpenAI Whisper API
//--------------------------------------------------------------

import axios from "axios";
import FormData from "form-data";
import { logger } from "../utils/logger.js";

export class WhisperService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audioBuffer: Buffer, filename: string = "audio.ogg"): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      logger.info(`🎙️ [Whisper] Transcribing audio (${(audioBuffer.length / 1024).toFixed(1)} KB)`);

      const form = new FormData();
      form.append("file", audioBuffer, {
        filename,
        contentType: "audio/ogg",
      });
      form.append("model", "whisper-1");
      form.append("language", "en"); // Can be made configurable
      form.append("response_format", "json");

      const response = await axios.post("https://api.openai.com/v1/audio/transcriptions", form, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...form.getHeaders(),
        },
        timeout: 30000,
      });

      const transcription = response.data.text;
      logger.info(`✅ [Whisper] Transcribed: "${transcription.substring(0, 100)}${transcription.length > 100 ? "..." : ""}"`);

      return { success: true, text: transcription };
    } catch (err: any) {
      logger.error(`❌ [Whisper] Transcription failed: ${err.message}`);
      if (err.response) {
        logger.error(`[Whisper] OpenAI API error: ${JSON.stringify(err.response.data)}`);
      }
      return { success: false, error: err.message };
    }
  }
}
