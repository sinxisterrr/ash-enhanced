//--------------------------------------------------------------
// FILE: src/services/spotifyService.ts
// Spotify Service - Full Spotify Web API integration
//--------------------------------------------------------------

import axios from "axios";
import { logger } from "../utils/logger.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

type SpotifyConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string | null;
  expiresAt: number;
};

// In-memory token cache
let tokenCache: { accessToken: string | null; expiresAt: number } = {
  accessToken: null,
  expiresAt: 0,
};

export class SpotifyService {
  private config: SpotifyConfig;

  constructor() {
    const clientId = process.env.SPOTIFY_CLIENT_ID || "";
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || "";

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Missing Spotify credentials! Need SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN");
    }

    this.config = {
      clientId,
      clientSecret,
      refreshToken,
      accessToken: tokenCache.accessToken,
      expiresAt: tokenCache.expiresAt,
    };
  }

  private async refreshAccessToken(): Promise<string> {
    try {
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.config.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000,
        }
      );

      const accessToken = response.data.access_token;
      this.config.accessToken = accessToken;
      this.config.expiresAt = Date.now() + response.data.expires_in * 1000;

      // Update cache
      tokenCache.accessToken = accessToken;
      tokenCache.expiresAt = this.config.expiresAt;

      return accessToken;
    } catch (err: any) {
      throw new Error(`Failed to refresh Spotify token: ${err.message}`);
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Refresh if expired (with 60s buffer)
    if (!this.config.accessToken || now >= this.config.expiresAt - 60000) {
      return await this.refreshAccessToken();
    }
    return this.config.accessToken;
  }

  private async makeRequest(method: string, endpoint: string, data?: any): Promise<any> {
    const token = await this.getAccessToken();
    const url = `${SPOTIFY_API_BASE}${endpoint}`;

    try {
      const response = await axios({
        method,
        url,
        headers: { Authorization: `Bearer ${token}` },
        data,
        timeout: 15000,
      });
      return response.data;
    } catch (err: any) {
      if (err.response) {
        throw new Error(`Spotify API error: ${err.response.status} ${JSON.stringify(err.response.data)}`);
      }
      throw err;
    }
  }

  async search(query: string, type: string = "track", limit: number = 10): Promise<any> {
    const params = new URLSearchParams({ q: query, type, limit: limit.toString() });
    return await this.makeRequest("GET", `/search?${params}`);
  }

  async play(contextUri?: string, uris?: string[]): Promise<string> {
    const data: any = {};
    if (contextUri) data.context_uri = contextUri;
    if (uris) data.uris = uris;

    await this.makeRequest("PUT", "/me/player/play", data);
    return "Playback started";
  }

  async pause(): Promise<string> {
    await this.makeRequest("PUT", "/me/player/pause");
    return "Playback paused";
  }

  async next(): Promise<string> {
    await this.makeRequest("POST", "/me/player/next");
    return "Skipped to next track";
  }

  async previous(): Promise<string> {
    await this.makeRequest("POST", "/me/player/previous");
    return "Skipped to previous track";
  }

  async getNowPlaying(): Promise<string> {
    const data = await this.makeRequest("GET", "/me/player/currently-playing");

    if (!data || !data.item) {
      return "Nothing currently playing";
    }

    const track = data.item;
    const artists = track.artists.map((a: any) => a.name).join(", ");
    const progress = Math.floor(data.progress_ms / 1000);
    const duration = Math.floor(track.duration_ms / 1000);

    return `🎵 ${track.name}\n🎤 ${artists}\n⏱️ ${progress}s / ${duration}s`;
  }

  async createPlaylist(name: string, description?: string, isPublic: boolean = false): Promise<any> {
    const me = await this.makeRequest("GET", "/me");
    const data = {
      name,
      description: description || "",
      public: isPublic,
    };

    return await this.makeRequest("POST", `/users/${me.id}/playlists`, data);
  }

  async addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<string> {
    await this.makeRequest("POST", `/playlists/${playlistId}/tracks`, { uris: trackUris });
    return `Added ${trackUris.length} track(s) to playlist`;
  }

  async addToQueue(trackUri: string): Promise<string> {
    await this.makeRequest("POST", `/me/player/queue?uri=${trackUri}`);
    return "Added to queue";
  }

  async getMyPlaylists(limit: number = 20): Promise<string> {
    const data = await this.makeRequest("GET", `/me/playlists?limit=${limit}`);
    const playlists = data.items.map((p: any) => `- ${p.name} (${p.tracks.total} tracks)`).join("\n");
    return `Your playlists:\n${playlists}`;
  }

  // High-level operations

  async searchAndPlay(query: string, contentType: string = "track"): Promise<string> {
    logger.info(`[Spotify] Searching for ${contentType}: "${query}"`);
    const results = await this.search(query, contentType, 1);

    const items = results[`${contentType}s`]?.items;
    if (!items || items.length === 0) {
      return `No ${contentType}s found for "${query}"`;
    }

    const item = items[0];
    await this.play(item.uri);
    return `Now playing: ${item.name}`;
  }

  async createPlaylistWithSongs(name: string, songs: string, description?: string): Promise<string> {
    logger.info(`[Spotify] Creating playlist "${name}" with songs`);
    const playlist = await this.createPlaylist(name, description);

    const songList = songs.split(";").map(s => s.trim()).filter(s => s);
    const trackUris: string[] = [];
    const failed: string[] = [];

    for (const song of songList) {
      try {
        const results = await this.search(song, "track", 1);
        const tracks = results.tracks?.items;
        if (tracks && tracks.length > 0) {
          trackUris.push(tracks[0].uri);
        } else {
          failed.push(song);
        }
      } catch {
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

  async executeBatch(operations: any[]): Promise<string> {
    logger.info(`[Spotify] Executing batch of ${operations.length} operations`);
    const results: string[] = [];

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
            } else if (op.spotify_id) {
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
            } else {
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
      } catch (err: any) {
        results.push(`❌ ${op.action}: ${err.message}`);
      }
    }

    return results.join("\n");
  }
}
