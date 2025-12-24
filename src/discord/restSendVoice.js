"use strict";
//--------------------------------------------------------------
// FILE: src/discord/restSendVoice.ts
// Send ElevenLabs voice notes via Discord REST (no python)
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVoiceMessageViaRest = sendVoiceMessageViaRest;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const elevenlabsService_js_1 = require("../elevenlabs/elevenlabsService.js");
const logger_js_1 = require("../utils/logger.js");
async function sendVoiceMessageViaRest(args) {
    // LLM sometimes sends "message" instead of "text" - normalize it
    const text = args.text || args.message;
    if (!text) {
        logger_js_1.logger.error("[VoiceMessage] Missing text/message parameter!");
        return "Error: No text provided for voice message.";
    }
    logger_js_1.logger.info("🎤 [VoiceMessage] Attempting to send voice message");
    logger_js_1.logger.debug(`[VoiceMessage] Text: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);
    logger_js_1.logger.debug(`[VoiceMessage] Target: ${args.target}, Type: ${args.target_type || "auto"}`);
    const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || "";
    if (!token) {
        logger_js_1.logger.error("[VoiceMessage] DISCORD_TOKEN is not set!");
        return "Error: DISCORD_TOKEN is not set.";
    }
    const apiKey = process.env.ELEVENLABS_API_KEY || "";
    const defaultVoice = process.env.ELEVENLABS_VOICE_ID || "";
    if (!apiKey || !defaultVoice) {
        logger_js_1.logger.error(`[VoiceMessage] Missing ElevenLabs config - API Key: ${apiKey ? "set" : "NOT SET"}, Voice ID: ${defaultVoice ? "set" : "NOT SET"}`);
        return "Error: ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not set.";
    }
    logger_js_1.logger.info(`[VoiceMessage] Using ElevenLabs voice: ${args.voice_id || defaultVoice}, model: ${args.model_id || process.env.ELEVENLABS_MODEL_ID || "eleven_v3"}`);
    const voiceService = new elevenlabsService_js_1.ElevenLabsService(apiKey, defaultVoice);
    logger_js_1.logger.debug("[VoiceMessage] Generating speech with ElevenLabs...");
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
        logger_js_1.logger.error(`[VoiceMessage] ElevenLabs TTS failed: ${tts.error || "Unknown error"}`);
        return `Error: ${tts.error || "Failed to generate audio."}`;
    }
    logger_js_1.logger.info(`[VoiceMessage] Speech generated successfully (${(tts.audioBuffer.length / 1024).toFixed(1)} KB, took ${tts.duration}ms)`);
    let channelId = args.target;
    const targetType = args.target_type || "auto";
    if (targetType === "user" || (targetType === "auto" && channelId && channelId.startsWith("7"))) {
        logger_js_1.logger.debug(`[VoiceMessage] Creating DM channel for user: ${channelId}`);
        try {
            const dmResp = await axios_1.default.post("https://discord.com/api/v10/users/@me/channels", { recipient_id: channelId }, { headers: { Authorization: `Bot ${token}` }, timeout: 10000 });
            channelId = dmResp.data?.id;
            logger_js_1.logger.debug(`[VoiceMessage] DM channel created: ${channelId}`);
        }
        catch (err) {
            logger_js_1.logger.error(`[VoiceMessage] Failed to create DM channel: ${err.message}`);
            if (err.response) {
                logger_js_1.logger.error(`[VoiceMessage] Discord API error: ${JSON.stringify(err.response.data)}`);
            }
            throw err;
        }
    }
    if (!channelId) {
        logger_js_1.logger.error("[VoiceMessage] Unable to resolve channel target");
        return "Error: Unable to resolve channel target.";
    }
    logger_js_1.logger.debug(`[VoiceMessage] Uploading to Discord channel: ${channelId}`);
    const form = new form_data_1.default();
    const payload = {};
    if (args.reply_to_message_id) {
        payload.message_reference = { message_id: args.reply_to_message_id };
        logger_js_1.logger.debug(`[VoiceMessage] Replying to message: ${args.reply_to_message_id}`);
    }
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", tts.audioBuffer, {
        filename: "voice_message.mp3",
        contentType: "audio/mpeg",
    });
    try {
        const response = await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, form, {
            headers: {
                Authorization: `Bot ${token}`,
                ...form.getHeaders(),
            },
            timeout: 60000,
        });
        logger_js_1.logger.info(`✅ [VoiceMessage] Successfully sent voice message (ID: ${response.data?.id})`);
        return "Voice message sent.";
    }
    catch (err) {
        logger_js_1.logger.error(`[VoiceMessage] Failed to upload to Discord: ${err.message}`);
        if (err.response) {
            logger_js_1.logger.error(`[VoiceMessage] Discord API error: ${JSON.stringify(err.response.data)}`);
        }
        throw err;
    }
}
