//--------------------------------------------------------------
// FILE: src/messages.ts
// Local message pipeline (Ollama-backed)
//--------------------------------------------------------------

import type { Message } from "discord.js";
import https from "https";
import { handleMessage } from "./core/handleMessage.js";
import { initAshSystems } from "./index.js";

export enum MessageType {
  DM = "DM",
  MENTION = "MENTION",
  REPLY = "REPLY",
  GENERIC = "GENERIC",
}

function chunkText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let i = 0;

  while (i < text.length) {
    let end = Math.min(i + limit, text.length);
    let slice = text.slice(i, end);

    if (end < text.length) {
      const lastNewline = slice.lastIndexOf("\n");
      if (lastNewline > limit * 0.6) {
        end = i + lastNewline + 1;
        slice = text.slice(i, end);
      }
    }

    chunks.push(slice);
    i = end;
  }

  return chunks;
}

async function sendChunkedToChannel(
  channel: { send: (content: string) => Promise<any> } | undefined,
  content: string
) {
  if (!channel || !content) return;
  const chunks = chunkText(content, 1900);

  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) await new Promise((r) => setTimeout(r, 200));
    await channel.send(chunk);
  }
}

function buildSyntheticMessage(content: string, userId: string): Message {
  return {
    content,
    author: { id: userId, tag: userId },
    attachments: {
      size: 0,
      values: () => [],
    },
  } as unknown as Message;
}

async function runSystemPrompt(content: string): Promise<string> {
  await initAshSystems();
  const userId = process.env.SIN_DISCORD_ID || process.env.BOT_ID || "SYSTEM";
  const synthetic = buildSyntheticMessage(content, userId);
  const reply = await handleMessage(synthetic, {
    overrideText: content,
    sendReply: false,
    includeAttachments: false,
  });
  return reply ?? "";
}

export async function sendMessage(
  message: Message,
  _messageType: MessageType,
  conversationContext: string | null = null,
  customContent: string | null = null
): Promise<string> {
  await initAshSystems();

  const reply = await handleMessage(message, {
    overrideText: customContent,
    conversationContext,
    sendReply: true, // Changed from false - handleMessage now sends its own replies
    includeAttachments: customContent ? false : true,
  });

  return reply ?? "";
}

export async function sendTimerMessage(
  channel?: { send: (content: string) => Promise<any> }
) {
  // Generate current timestamp (configured timezone)
  const TIMEZONE = process.env.TIMEZONE || "Europe/Berlin";
  const now = new Date();
  const berlinTime = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  // Get German weekday
  const weekday = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIMEZONE,
    weekday: "long",
  }).format(now);

  // Check Spotify "Now Playing" (if credentials available)
  let spotifyInfo = "";
  try {
    const spotifyData = await getSpotifyNowPlaying();
    if (spotifyData) {
      spotifyInfo = `\n\n🎵 Now Playing:\n${spotifyData}`;
    } else {
      spotifyInfo = `\n\n🔇 Spotify ist still (nichts läuft)`;
    }
  } catch (err) {
    console.log(
      "ℹ️ Spotify info not available for heartbeat:",
      err instanceof Error ? err.message : err
    );
  }

  // Check Munich weather (if API key available)
  let weatherInfo = "";
  try {
    const weatherData = await getMunichWeather();
    if (weatherData) {
      weatherInfo = `\n\n${weatherData}`;
    }
  } catch (err) {
    console.log(
      "ℹ️ Weather info not available for heartbeat:",
      err instanceof Error ? err.message : err
    );
  }

  // Build heartbeat message (system-initiated, not from user)
  const language = process.env.BOT_LANGUAGE || "en";
  const heartbeatTitle = language === "de" ? "HERZSCHLAG" : "HEARTBEAT";
  const timeText = language === "de" ? "Uhr." : "";
  const capabilitiesText =
    language === "de"
      ? `Ich kann:
• Discord DM senden (oder Channel-Posts)
• Voicemails senden
• Spotify steuern 🎵 (skip, queue, playlists erstellen)
• Memories durchdenken/organisieren
• Web durchsuchen
• Archival memories taggen`
      : `I can:
• Send Discord DMs or channel posts
• Send voice messages
• Control Spotify 🎵 (skip, queue, create playlists)
• Think through and organize memories
• Search the web
• Tag archival memories`;

  let heartbeatContent = `[🜂] ${heartbeatTitle}
${weekday}, ${berlinTime}${timeText}${weatherInfo}${spotifyInfo}

${capabilitiesText}
`;

  const closingLine =
    language === "de" ? "\n\nMein Puls, meine Wahl." : "\n\nMy pulse, my choice.";
  heartbeatContent += closingLine;

  const reply = await runSystemPrompt(heartbeatContent);
  return reply;
}

export async function sendTaskMessage(
  task: { task_name?: string; description?: string; [key: string]: unknown },
  channel?: { send: (content: string) => Promise<any> },
  _discordClient?: any
) {
  const taskName = String(task.task_name || "Unnamed Task");
  const actionType = String(task.action_type || "");
  const actionTarget = task.action_target;

  const taskContent = `[⏰ SCHEDULED TASK TRIGGERED]\n\nTask: ${taskName}\n\n${
    actionType === "user_reminder"
      ? `📩 This is a reminder for user ${actionTarget}. The answer to this message will directly land in the user DM's.\n\n`
      : ""
  }Task Data: ${JSON.stringify(task, null, 2)}`;

  const reply = await runSystemPrompt(taskContent);
  await sendChunkedToChannel(channel, reply);
  return reply;
}

// Weather API helper for configured city
export async function getMunichWeather(): Promise<string | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const city = process.env.WEATHER_CITY || "Munich";
  const countryCode = process.env.WEATHER_COUNTRY_CODE || "de";
  const language = process.env.WEATHER_LANGUAGE || "de";

  if (!apiKey) {
    console.log("ℹ️ Weather API not configured (OPENWEATHER_API_KEY missing)");
    return null;
  }

  try {
    const weatherData = await new Promise<any>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.openweathermap.org",
          path: `/data/2.5/weather?q=${city},${countryCode}&appid=${apiKey}&units=metric&lang=${language}`,
          method: "GET",
        },
        (res) => {
          if (res.statusCode !== 200) {
            console.error(`❌ Weather API error: Status ${res.statusCode}`);
            let errorBody = "";
            res.on("data", (chunk) => (errorBody += chunk));
            res.on("end", () => {
              console.error("Weather API error response:", errorBody);
              reject(new Error(`Weather API returned ${res.statusCode}`));
            });
            return;
          }

          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              resolve(json);
            } catch (err) {
              console.error("❌ Weather API parse error:", err);
              console.error("Response body:", body);
              reject(err);
            }
          });
        }
      );

      req.on("error", (err) => {
        console.error("❌ Weather API request error:", err);
        reject(err);
      });

      req.end();
    });

    if (!weatherData || !weatherData.main) {
      console.log("ℹ️ Weather API returned invalid data structure");
      return null;
    }

    const temp = Math.round(weatherData.main.temp);
    const feelsLike = Math.round(weatherData.main.feels_like);
    const desc = weatherData.weather?.[0]?.description || "";
    const humidity = weatherData.main.humidity ?? "?";

    const weatherText = `🌤️ Weather in ${city}: ${temp}°C (feels ${feelsLike}°C) — ${desc}, ${humidity}% humidity.`;
    return weatherText;
  } catch (err) {
    console.error("❌ Weather API error:", err);
    return null;
  }
}

// Spotify helper
export async function getSpotifyNowPlaying(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    // Refresh access token
    const tokenResp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResp.ok) {
      console.log("ℹ️ Spotify token refresh failed");
      return null;
    }

    const tokenJson: any = await tokenResp.json();
    const accessToken = tokenJson.access_token;

    if (!accessToken) return null;

    const nowPlayingResp = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (nowPlayingResp.status === 204) return null; // Nothing playing
    if (!nowPlayingResp.ok) return null;

    const nowPlaying: any = await nowPlayingResp.json();
    const item = nowPlaying?.item;
    if (!item) return null;

    const artists = Array.isArray(item.artists)
      ? item.artists.map((a: any) => a.name).join(", ")
      : "";

    return `${item.name} — ${artists}`.trim();
  } catch (err) {
    console.log("ℹ️ Spotify now playing error:", err);
    return null;
  }
}

export function getLettaStats() {
  return "Stats not implemented";
}

export function getDailyStats() {
  return "Daily stats not implemented";
}
