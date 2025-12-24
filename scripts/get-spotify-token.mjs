#!/usr/bin/env node
/**
 * Simple script to get Spotify refresh token
 *
 * Usage:
 * 1. node scripts/get-spotify-token.js
 * 2. Follow the instructions
 * 3. Copy the refresh token to Railway env vars
 */

import express from 'express';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
  console.error('Set them in your .env file or as environment variables');
  process.exit(1);
}

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
].join(' ');

const app = express();

let refreshToken = null;

app.get('/', (req, res) => {
  const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  })}`;

  res.send(`
    <h1>Spotify Token Generator</h1>
    <p>Click the button below to authorize Ash with Spotify:</p>
    <a href="${authUrl}"><button style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Authorize Spotify</button></a>
  `);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    res.send('<h1>Error: No authorization code received</h1>');
    return;
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = await tokenResponse.json();

    if (data.refresh_token) {
      refreshToken = data.refresh_token;

      res.send(`
        <h1>✅ Success!</h1>
        <p>Copy this refresh token to Railway:</p>
        <pre style="background: #f0f0f0; padding: 20px; margin: 20px 0; font-size: 14px; overflow-x: auto;">${refreshToken}</pre>
        <p><strong>Add it to Railway as:</strong> <code>SPOTIFY_REFRESH_TOKEN</code></p>
        <p>You can close this window now.</p>
      `);

      console.log('\n✅ SUCCESS! Copy this to Railway as SPOTIFY_REFRESH_TOKEN:');
      console.log('\n' + refreshToken + '\n');

      setTimeout(() => {
        console.log('Shutting down server...');
        process.exit(0);
      }, 3000);
    } else {
      res.send(`<h1>Error: ${JSON.stringify(data)}</h1>`);
    }
  } catch (err) {
    res.send(`<h1>Error: ${err.message}</h1>`);
  }
});

const PORT = 8888;
app.listen(PORT, () => {
  console.log(`\n🎵 Spotify Token Generator`);
  console.log(`Server running at http://127.0.0.1:${PORT}`);
  console.log(`\n👉 Open this URL in your browser:\n`);
  console.log(`   http://127.0.0.1:${PORT}\n`);
});
