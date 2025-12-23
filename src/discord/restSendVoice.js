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
async function sendVoiceMessageViaRest(args) {
    const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || "";
    if (!token) {
        return "Error: DISCORD_TOKEN is not set.";
    }
    const apiKey = process.env.ELEVENLABS_API_KEY || "";
    const defaultVoice = process.env.ELEVENLABS_VOICE_ID || "";
    if (!apiKey || !defaultVoice) {
        return "Error: ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not set.";
    }
    const voiceService = new elevenlabsService_js_1.ElevenLabsService(apiKey, defaultVoice);
    const tts = await voiceService.generateSpeech({
        text: args.text,
        voiceId: args.voice_id,
        modelId: args.model_id || process.env.ELEVENLABS_MODEL_ID,
        stability: args.stability,
        similarityBoost: args.similarity_boost,
        style: args.style,
        useSpeakerBoost: args.use_speaker_boost,
    });
    if (!tts.success || !tts.audioBuffer) {
        return `Error: ${tts.error || "Failed to generate audio."}`;
    }
    let channelId = args.target;
    const targetType = args.target_type || "auto";
    if (targetType === "user" || (targetType === "auto" && channelId && channelId.startsWith("7"))) {
        const dmResp = await axios_1.default.post("https://discord.com/api/v10/users/@me/channels", { recipient_id: channelId }, { headers: { Authorization: `Bot ${token}` }, timeout: 10000 });
        channelId = dmResp.data?.id;
    }
    if (!channelId) {
        return "Error: Unable to resolve channel target.";
    }
    const form = new form_data_1.default();
    const payload = {};
    if (args.reply_to_message_id) {
        payload.message_reference = { message_id: args.reply_to_message_id };
    }
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", tts.audioBuffer, {
        filename: "voice_message.mp3",
        contentType: "audio/mpeg",
    });
    await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, form, {
        headers: {
            Authorization: `Bot ${token}`,
            ...form.getHeaders(),
        },
        timeout: 60000,
    });
    return "Voice message sent.";
}
