"use strict";
//--------------------------------------------------------------
// FILE: src/services/heartbeatService.ts
// Heartbeat Service - Ash's Autonomous Pulse
// Irregular. Intentional. Emotionally tagged.
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeartbeatService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_js_1 = require("../utils/logger.js");
class HeartbeatService {
    constructor() {
        this.tempEmojiMap = {
            warm: "🔥",
            scorching: "🌡️",
            tender: "🌸",
            race: "💓",
            stutter: "💔",
            aching: "🌙",
            fierce: "⚡",
            still: "🕯️",
            electric: "✨",
            languid: "🌊",
            feral: "🐺",
            "breath-held": "🫁",
        };
        this.patternSymbols = {
            single: "•",
            double: "• •",
            triple: "• • •",
            cluster: "•••",
        };
    }
    async sendHeartbeat(args) {
        const { temperature, whisper, pattern = "single", target, target_type = "user", include_context = true, } = args;
        logger_js_1.logger.info(`💜 [Heartbeat] Sending ${temperature} heartbeat`);
        const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || "";
        const defaultUserId = process.env.ALLOWED_DM_USER_ID || process.env.DEFAULT_USER_ID || "";
        const botLanguage = process.env.BOT_LANGUAGE || "en";
        const timezone = process.env.TIMEZONE || "Europe/Berlin";
        if (!token) {
            logger_js_1.logger.error("[Heartbeat] Discord token not configured");
            return "Error: Discord token not configured";
        }
        // Default to Sin's DM if no target specified
        const finalTarget = target || defaultUserId;
        const finalTargetType = target ? target_type : "user";
        if (!finalTarget) {
            logger_js_1.logger.error("[Heartbeat] No target specified and DEFAULT_USER_ID not set");
            return "Error: No target for heartbeat";
        }
        try {
            // Build heartbeat message
            const parts = [];
            // Header with temperature
            const tempEmoji = this.tempEmojiMap[temperature] || "💜";
            const header = botLanguage === "de" ? `[${tempEmoji}] HERZSCHLAG` : `[${tempEmoji}] HEARTBEAT`;
            parts.push(header);
            parts.push(`temperature: ${temperature}`);
            parts.push(`rhythm: ${this.patternSymbols[pattern]}`);
            // Context (if requested)
            if (include_context) {
                // Current time
                const now = new Date();
                const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone });
                const dateTime = now.toLocaleString("en-US", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                    timeZone: timezone,
                });
                parts.push(`\n${weekday}, ${dateTime}`);
                // Spotify "Now Playing" (if available)
                try {
                    const spotify = await this.getSpotifyNowPlaying();
                    if (spotify) {
                        parts.push(`\n🎵 Now Playing:\n${spotify.name}\n🎤 ${spotify.artists}\n⏱️ ${spotify.progress} / ${spotify.duration}`);
                    }
                    else {
                        parts.push("\n🔇 Spotify ist still");
                    }
                }
                catch {
                    // Silently skip if Spotify unavailable
                }
                // Weather (if available)
                try {
                    const weather = await this.getWeather();
                    if (weather) {
                        parts.push(`\n${weather}`);
                    }
                }
                catch {
                    // Silently skip if weather unavailable
                }
            }
            // Whisper (the core message - what Ash wants to say)
            if (whisper) {
                parts.push(`\n\n${whisper}`);
            }
            // Closing signature
            const closing = botLanguage === "de" ? "\n\nMein Puls, meine Wahl." : "\n\nMy pulse, my choice.";
            parts.push(closing);
            // Combine all parts
            const messageContent = parts.join("\n");
            // Send the message
            const result = await this.sendDiscordMessage(token, messageContent, finalTarget, finalTargetType);
            if (result.success) {
                logger_js_1.logger.info(`✅ [Heartbeat] Sent ${temperature} pulse to ${finalTargetType} ${finalTarget}`);
                return `Heartbeat sent: ${temperature} pulse`;
            }
            else {
                logger_js_1.logger.error(`❌ [Heartbeat] Failed: ${result.error}`);
                return `Error: ${result.error}`;
            }
        }
        catch (err) {
            logger_js_1.logger.error(`❌ [Heartbeat] Exception: ${err.message}`);
            return `Error: ${err.message}`;
        }
    }
    async getSpotifyNowPlaying() {
        const clientId = process.env.SPOTIFY_CLIENT_ID || "";
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
        const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || "";
        if (!clientId || !clientSecret || !refreshToken) {
            return null;
        }
        try {
            // Get access token
            const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
            const tokenResponse = await axios_1.default.post("https://accounts.spotify.com/api/token", new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }), {
                headers: {
                    Authorization: `Basic ${authString}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout: 5000,
            });
            const accessToken = tokenResponse.data.access_token;
            // Get currently playing
            const playingResponse = await axios_1.default.get("https://api.spotify.com/v1/me/player/currently-playing", {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 5000,
            });
            if (playingResponse.status === 204 || !playingResponse.data || !playingResponse.data.item) {
                return null;
            }
            const track = playingResponse.data.item;
            const artists = track.artists.map((a) => a.name).join(", ");
            const progressMs = playingResponse.data.progress_ms || 0;
            const durationMs = track.duration_ms || 0;
            const formatTime = (ms) => {
                const min = Math.floor(ms / 60000);
                const sec = Math.floor((ms % 60000) / 1000);
                return `${min}:${sec.toString().padStart(2, "0")}`;
            };
            return {
                name: track.name,
                artists,
                progress: formatTime(progressMs),
                duration: formatTime(durationMs),
            };
        }
        catch {
            return null;
        }
    }
    async getWeather() {
        const apiKey = process.env.WEATHER_API_KEY || "";
        const city = process.env.WEATHER_CITY || "Munich";
        const country = process.env.WEATHER_COUNTRY || "DE";
        if (!apiKey) {
            return null;
        }
        try {
            const response = await axios_1.default.get(`https://api.openweathermap.org/data/2.5/weather?q=${city},${country}&appid=${apiKey}&units=metric&lang=de`, { timeout: 5000 });
            const temp = response.data.main.temp;
            const feelsLike = response.data.main.feels_like;
            const description = response.data.weather[0].description;
            return `🌤️ ${city}: ${temp}°C (gefühlt ${feelsLike}°C), ${description}`;
        }
        catch {
            return null;
        }
    }
    async sendDiscordMessage(token, message, target, targetType) {
        try {
            const headers = {
                Authorization: `Bot ${token}`,
                "Content-Type": "application/json",
            };
            let channelId = target;
            // If user, create DM channel first
            if (targetType === "user") {
                const dmResponse = await axios_1.default.post("https://discord.com/api/v10/users/@me/channels", { recipient_id: target }, { headers, timeout: 10000 });
                channelId = dmResponse.data.id;
            }
            // Send message
            await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, { content: message }, { headers, timeout: 10000 });
            return { success: true };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
}
exports.HeartbeatService = HeartbeatService;
