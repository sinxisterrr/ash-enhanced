"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElevenLabsService = void 0;
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
/**
 * ElevenLabs Text-to-Speech Service
 * Supports Eleven v3 (alpha) model with Audio Tags support
 *
 * Audio Tags Format (for v3 model):
 * - [whispering] - whispering tone
 * - [laughs] - laughing
 * - [sighs] - sighing
 * - [excited] - excited tone
 * - [sarcastic] - sarcastic tone
 * - [strong X accent] - accent (e.g., [strong French accent])
 * - [applause] - sound effects
 *
 * Example: "[excited] Hey! [whispering] I have a secret for you."
 */
class ElevenLabsService {
    constructor(apiKey, voiceId, tempDir) {
        this.defaultModelId = 'eleven_v3'; // Eleven v3 (alpha) - supports Audio Tags!
        this.baseUrl = 'https://api.elevenlabs.io/v1';
        if (!apiKey || !voiceId) {
            throw new Error('ElevenLabs API key and Voice ID are required');
        }
        this.apiKey = apiKey;
        this.defaultVoiceId = voiceId;
        this.tempDir = tempDir || path.join(process.cwd(), 'temp_audio');
    }
    /**
     * Initialize the service (create temp directory)
     */
    async initialize() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            console.log('✅ ElevenLabs Service initialized');
        }
        catch (error) {
            console.error('❌ Failed to initialize ElevenLabs service:', error);
            throw error;
        }
    }
    /**
     * Generate speech from text using ElevenLabs API
     * Supports Audio Tags for v3 model (e.g., [excited], [whispering])
     */
    async generateSpeech(request) {
        const startTime = Date.now();
        try {
            // Validate input
            if (!request.text || typeof request.text !== 'string' || request.text.trim().length === 0) {
                return {
                    success: false,
                    error: 'Text is required and must be non-empty',
                    duration: Date.now() - startTime
                };
            }
            // Security: Limit text length (ElevenLabs v3 has 3000 char limit, but we'll be conservative)
            if (request.text.length > 3000) {
                return {
                    success: false,
                    error: `Text too long (${request.text.length} chars). Maximum is 3000 characters.`,
                    duration: Date.now() - startTime
                };
            }
            const voiceId = request.voiceId || this.defaultVoiceId;
            const modelId = request.modelId || this.defaultModelId;
            // Build API request
            const url = `${this.baseUrl}/text-to-speech/${voiceId}`;
            const requestBody = {
                text: request.text.trim(),
                model_id: modelId,
            };
            // Add voice settings (optional, but recommended)
            if (request.stability !== undefined || request.similarityBoost !== undefined ||
                request.style !== undefined || request.useSpeakerBoost !== undefined) {
                requestBody.voice_settings = {};
                if (request.stability !== undefined) {
                    requestBody.voice_settings.stability = Math.max(0, Math.min(1, request.stability));
                }
                if (request.similarityBoost !== undefined) {
                    requestBody.voice_settings.similarity_boost = Math.max(0, Math.min(1, request.similarityBoost));
                }
                if (request.style !== undefined) {
                    requestBody.voice_settings.style = Math.max(0, Math.min(1, request.style));
                }
                if (request.useSpeakerBoost !== undefined) {
                    requestBody.voice_settings.use_speaker_boost = request.useSpeakerBoost;
                }
            }
            else {
                // Default settings (recommended by ElevenLabs)
                requestBody.voice_settings = {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: false
                };
            }
            // Make API request
            const response = await axios_1.default.post(url, requestBody, {
                headers: {
                    'xi-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer', // Get binary audio data
                timeout: 300000 // 🎤 5 Minuten timeout für Voice Messages (ElevenLabs + Verarbeitung braucht länger!)
            });
            if (response.status !== 200) {
                return {
                    success: false,
                    error: `API returned status ${response.status}`,
                    duration: Date.now() - startTime
                };
            }
            // Convert to Buffer
            const audioBuffer = Buffer.from(response.data, 'binary');
            // Security: Validate audio buffer size (max 25MB for Discord)
            if (audioBuffer.length > 25 * 1024 * 1024) {
                return {
                    success: false,
                    error: `Audio file too large (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB). Maximum is 25MB.`,
                    duration: Date.now() - startTime
                };
            }
            return {
                success: true,
                audioBuffer,
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            let errorMessage = 'Unknown error';
            if (axios_1.default.isAxiosError(error)) {
                if (error.response) {
                    // API returned error response
                    const status = error.response.status;
                    const data = error.response.data;
                    if (typeof data === 'string') {
                        errorMessage = `API Error ${status}: ${data}`;
                    }
                    else if (data && typeof data === 'object' && 'detail' in data) {
                        errorMessage = `API Error ${status}: ${data.detail?.message || JSON.stringify(data)}`;
                    }
                    else {
                        errorMessage = `API Error ${status}: ${JSON.stringify(data)}`;
                    }
                }
                else if (error.request) {
                    errorMessage = 'No response from ElevenLabs API (network error)';
                }
                else {
                    errorMessage = `Request setup error: ${error.message}`;
                }
            }
            else if (error instanceof Error) {
                errorMessage = error.message;
            }
            else {
                errorMessage = String(error);
            }
            return {
                success: false,
                error: errorMessage,
                duration: Date.now() - startTime
            };
        }
    }
    /**
     * Clean up temporary files (optional cleanup method)
     */
    async cleanup() {
        try {
            // Could implement cleanup of old temp files here if needed
            // For now, we're using in-memory buffers, so no cleanup needed
        }
        catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}
exports.ElevenLabsService = ElevenLabsService;
