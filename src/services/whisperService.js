"use strict";
//--------------------------------------------------------------
// FILE: src/services/whisperService.ts
// Whisper Service - Speech-to-Text using OpenAI Whisper API
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperService = void 0;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const logger_js_1 = require("../utils/logger.js");
class WhisperService {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async transcribe(audioBuffer, filename = "audio.ogg") {
        try {
            logger_js_1.logger.info(`🎙️ [Whisper] Transcribing audio (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
            const form = new form_data_1.default();
            form.append("file", audioBuffer, {
                filename,
                contentType: "audio/ogg",
            });
            form.append("model", "whisper-1");
            form.append("language", "en"); // Can be made configurable
            form.append("response_format", "json");
            const response = await axios_1.default.post("https://api.openai.com/v1/audio/transcriptions", form, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    ...form.getHeaders(),
                },
                timeout: 30000,
            });
            const transcription = response.data.text;
            logger_js_1.logger.info(`✅ [Whisper] Transcribed: "${transcription.substring(0, 100)}${transcription.length > 100 ? "..." : ""}"`);
            return { success: true, text: transcription };
        }
        catch (err) {
            logger_js_1.logger.error(`❌ [Whisper] Transcription failed: ${err.message}`);
            if (err.response) {
                logger_js_1.logger.error(`[Whisper] OpenAI API error: ${JSON.stringify(err.response.data)}`);
            }
            return { success: false, error: err.message };
        }
    }
}
exports.WhisperService = WhisperService;
