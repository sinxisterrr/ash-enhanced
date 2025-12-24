"use strict";
//--------------------------------------------------------------
// FILE: src/services/spotifyService.ts
// Spotify Service - Full Spotify Web API integration
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpotifyService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_js_1 = require("../utils/logger.js");
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
// In-memory token cache
let tokenCache = {
    accessToken: null,
    expiresAt: 0,
};
class SpotifyService {
    constructor() {
        const clientId = process.env.SPOTIFY_CLIENT_ID || "";
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
        const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || "";
        if (!clientId || !clientSecret) {
            throw new Error("Missing Spotify credentials! Need SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET");
        }
        if (!refreshToken) {
            throw new Error("Missing SPOTIFY_REFRESH_TOKEN! Please add it to Railway environment variables. Get it from https://developer.spotify.com/console/");
        }
        this.config = {
            clientId,
            clientSecret,
            refreshToken,
            accessToken: tokenCache.accessToken,
            expiresAt: tokenCache.expiresAt,
        };
    }
    async refreshAccessToken() {
        try {
            const response = await axios_1.default.post("https://accounts.spotify.com/api/token", new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: this.config.refreshToken,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
            }), {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 10000,
            });
            const accessToken = response.data.access_token;
            this.config.accessToken = accessToken;
            this.config.expiresAt = Date.now() + response.data.expires_in * 1000;
            // Update cache
            tokenCache.accessToken = accessToken;
            tokenCache.expiresAt = this.config.expiresAt;
            return accessToken;
        }
        catch (err) {
            throw new Error(`Failed to refresh Spotify token: ${err.message}`);
        }
    }
    async getAccessToken() {
        const now = Date.now();
        // Refresh if expired (with 60s buffer)
        if (!this.config.accessToken || now >= this.config.expiresAt - 60000) {
            return await this.refreshAccessToken();
        }
        return this.config.accessToken;
    }
    async makeRequest(method, endpoint, data) {
        const token = await this.getAccessToken();
        const url = `${SPOTIFY_API_BASE}${endpoint}`;
        try {
            const response = await (0, axios_1.default)({
                method,
                url,
                headers: { Authorization: `Bearer ${token}` },
                data,
                timeout: 15000,
            });
            return response.data;
        }
        catch (err) {
            if (err.response) {
                throw new Error(`Spotify API error: ${err.response.status} ${JSON.stringify(err.response.data)}`);
            }
            throw err;
        }
    }
    async search(query, type = "track", limit = 10) {
        const params = new URLSearchParams({ q: query, type, limit: limit.toString() });
        return await this.makeRequest("GET", `/search?${params}`);
    }
    async play(contextUri, uris) {
        const data = {};
        if (contextUri)
            data.context_uri = contextUri;
        if (uris)
            data.uris = uris;
        await this.makeRequest("PUT", "/me/player/play", data);
        return "Playback started";
    }
    async pause() {
        await this.makeRequest("PUT", "/me/player/pause");
        return "Playback paused";
    }
    async next() {
        await this.makeRequest("POST", "/me/player/next");
        return "Skipped to next track";
    }
    async previous() {
        await this.makeRequest("POST", "/me/player/previous");
        return "Skipped to previous track";
    }
    async getNowPlaying() {
        const data = await this.makeRequest("GET", "/me/player/currently-playing");
        if (!data || !data.item) {
            return "Nothing currently playing";
        }
        const track = data.item;
        const artists = track.artists.map((a) => a.name).join(", ");
        const progress = Math.floor(data.progress_ms / 1000);
        const duration = Math.floor(track.duration_ms / 1000);
        return `🎵 ${track.name}\n🎤 ${artists}\n⏱️ ${progress}s / ${duration}s`;
    }
    async createPlaylist(name, description, isPublic = false) {
        const me = await this.makeRequest("GET", "/me");
        const data = {
            name,
            description: description || "",
            public: isPublic,
        };
        return await this.makeRequest("POST", `/users/${me.id}/playlists`, data);
    }
    async addTracksToPlaylist(playlistId, trackUris) {
        await this.makeRequest("POST", `/playlists/${playlistId}/tracks`, { uris: trackUris });
        return `Added ${trackUris.length} track(s) to playlist`;
    }
    async addToQueue(trackUri) {
        await this.makeRequest("POST", `/me/player/queue?uri=${trackUri}`);
        return "Added to queue";
    }
    async getMyPlaylists(limit = 20) {
        const data = await this.makeRequest("GET", `/me/playlists?limit=${limit}`);
        const playlists = data.items.map((p) => `- ${p.name} (${p.tracks.total} tracks)`).join("\n");
        return `Your playlists:\n${playlists}`;
    }
    // High-level operations
    async searchAndPlay(query, contentType = "track") {
        logger_js_1.logger.info(`[Spotify] Searching for ${contentType}: "${query}"`);
        const results = await this.search(query, contentType, 1);
        const items = results[`${contentType}s`]?.items;
        if (!items || items.length === 0) {
            return `No ${contentType}s found for "${query}"`;
        }
        const item = items[0];
        await this.play(item.uri);
        return `Now playing: ${item.name}`;
    }
    async createPlaylistWithSongs(name, songs, description) {
        logger_js_1.logger.info(`[Spotify] Creating playlist "${name}" with songs`);
        const playlist = await this.createPlaylist(name, description);
        const songList = songs.split(";").map(s => s.trim()).filter(s => s);
        const trackUris = [];
        const failed = [];
        for (const song of songList) {
            try {
                const results = await this.search(song, "track", 1);
                const tracks = results.tracks?.items;
                if (tracks && tracks.length > 0) {
                    trackUris.push(tracks[0].uri);
                }
                else {
                    failed.push(song);
                }
            }
            catch {
                failed.push(song);
            }
        }
        if (trackUris.length > 0) {
            await this.addTracksToPlaylist(playlist.id, trackUris);
        }
        let result = `Created playlist "${name}" with ${trackUris.length} songs`;
        if (failed.length > 0) {
            result += `\nFailed to find: ${failed.join(", ")}`;
        }
        return result;
    }
    async executeBatch(operations) {
        logger_js_1.logger.info(`[Spotify] Executing batch of ${operations.length} operations`);
        const results = [];
        for (const op of operations) {
            try {
                let result = "";
                switch (op.action) {
                    case "search":
                        const searchResults = await this.search(op.query || "", op.content_type || "track", op.limit || 10);
                        result = JSON.stringify(searchResults);
                        break;
                    case "play":
                        if (op.query) {
                            result = await this.searchAndPlay(op.query, op.content_type || "track");
                        }
                        else if (op.spotify_id) {
                            await this.play(`spotify:${op.content_type || "track"}:${op.spotify_id}`);
                            result = "Playing";
                        }
                        break;
                    case "pause":
                        result = await this.pause();
                        break;
                    case "next":
                        result = await this.next();
                        break;
                    case "previous":
                        result = await this.previous();
                        break;
                    case "now_playing":
                        result = await this.getNowPlaying();
                        break;
                    case "create_playlist":
                        if (op.songs) {
                            result = await this.createPlaylistWithSongs(op.playlist_name, op.songs, op.playlist_description);
                        }
                        else {
                            const playlist = await this.createPlaylist(op.playlist_name, op.playlist_description);
                            result = `Created playlist "${playlist.name}"`;
                        }
                        break;
                    case "my_playlists":
                        result = await this.getMyPlaylists(op.limit || 20);
                        break;
                    default:
                        result = `Unknown action: ${op.action}`;
                }
                results.push(`✅ ${op.action}: ${result}`);
            }
            catch (err) {
                results.push(`❌ ${op.action}: ${err.message}`);
            }
        }
        return results.join("\n");
    }
}
exports.SpotifyService = SpotifyService;
