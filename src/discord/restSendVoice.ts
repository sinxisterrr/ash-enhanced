//--------------------------------------------------------------
// FILE: src/discord/restSendVoice.ts
// Send ElevenLabs voice notes via Discord REST (no python)
//--------------------------------------------------------------

import axios from "axios";
import FormData from "form-data";
import { ElevenLabsService } from "../elevenlabs/elevenlabsService.js";
import { logger } from "../utils/logger.js";

type VoiceArgs = {
  text?: string;
  message?: string;  // LLM sometimes uses "message" instead of "text"
  target: string;
  target_type?: "user" | "channel" | "auto";
  voice_id?: string;
  model_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  reply_to_message_id?: string;
};

export async function sendVoiceMessageViaRest(args: VoiceArgs): Promise<string> {
  // LLM sometimes sends "message" instead of "text" - normalize it
  const text = args.text || args.message;

  if (!text) {
    logger.error("[VoiceMessage] Missing text/message parameter!");
    return "Error: No text provided for voice message.";
  }

  logger.info("🎤 [VoiceMessage] Attempting to send voice message");
  logger.debug(`[VoiceMessage] Text: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);
  logger.debug(`[VoiceMessage] Target: ${args.target}, Type: ${args.target_type || "auto"}`);

  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || "";
  if (!token) {
    logger.error("[VoiceMessage] DISCORD_TOKEN is not set!");
    return "Error: DISCORD_TOKEN is not set.";
  }

  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID || "";
  if (!apiKey || !defaultVoice) {
    logger.error(`[VoiceMessage] Missing ElevenLabs config - API Key: ${apiKey ? "set" : "NOT SET"}, Voice ID: ${defaultVoice ? "set" : "NOT SET"}`);
    return "Error: ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not set.";
  }

  logger.info(`[VoiceMessage] Using ElevenLabs voice: ${args.voice_id || defaultVoice}, model: ${args.model_id || process.env.ELEVENLABS_MODEL_ID || "eleven_v3"}`);

  const voiceService = new ElevenLabsService(apiKey, defaultVoice);

  logger.debug("[VoiceMessage] Generating speech with ElevenLabs...");
  const tts = await voiceService.generateSpeech({
    text: text,
    voiceId: args.voice_id,
    modelId: args.model_id || process.env.ELEVENLABS_MODEL_ID,
    stability: args.stability,
    similarityBoost: args.similarity_boost,
    style: args.style,
    useSpeakerBoost: args.use_speaker_boost,
  });

  if (!tts.success || !tts.audioBuffer) {
    logger.error(`[VoiceMessage] ElevenLabs TTS failed: ${tts.error || "Unknown error"}`);
    return `Error: ${tts.error || "Failed to generate audio."}`;
  }

  logger.info(`[VoiceMessage] Speech generated successfully (${(tts.audioBuffer.length / 1024).toFixed(1)} KB, took ${tts.duration}ms)`);


  let channelId = args.target;
  const targetType = args.target_type || "auto";

  if (targetType === "user" || (targetType === "auto" && channelId && channelId.startsWith("7"))) {
    logger.debug(`[VoiceMessage] Creating DM channel for user: ${channelId}`);
    try {
      const dmResp = await axios.post(
        "https://discord.com/api/v10/users/@me/channels",
        { recipient_id: channelId },
        { headers: { Authorization: `Bot ${token}` }, timeout: 10000 }
      );
      channelId = dmResp.data?.id;
      logger.debug(`[VoiceMessage] DM channel created: ${channelId}`);
    } catch (err: any) {
      logger.error(`[VoiceMessage] Failed to create DM channel: ${err.message}`);
      if (err.response) {
        logger.error(`[VoiceMessage] Discord API error: ${JSON.stringify(err.response.data)}`);
      }
      throw err;
    }
  }

  if (!channelId) {
    logger.error("[VoiceMessage] Unable to resolve channel target");
    return "Error: Unable to resolve channel target.";
  }

  logger.debug(`[VoiceMessage] Uploading to Discord channel: ${channelId}`);

  const form = new FormData();
  const payload: Record<string, any> = {};
  if (args.reply_to_message_id) {
    payload.message_reference = { message_id: args.reply_to_message_id };
    logger.debug(`[VoiceMessage] Replying to message: ${args.reply_to_message_id}`);
  }

  form.append("payload_json", JSON.stringify(payload));
  form.append("files[0]", tts.audioBuffer, {
    filename: "voice_message.mp3",
    contentType: "audio/mpeg",
  });

  try {
    const response = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      form,
      {
        headers: {
          Authorization: `Bot ${token}`,
          ...form.getHeaders(),
        },
        timeout: 60000,
      }
    );
    logger.info(`✅ [VoiceMessage] Successfully sent voice message (ID: ${response.data?.id})`);
    return "Voice message sent.";
  } catch (err: any) {
    logger.error(`[VoiceMessage] Failed to upload to Discord: ${err.message}`);
    if (err.response) {
      logger.error(`[VoiceMessage] Discord API error: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}
