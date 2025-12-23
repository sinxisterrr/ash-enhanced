#!/usr/bin/env node
/**
 * ElevenLabs API Diagnostic Tool
 * Tests the API key and voice ID to diagnose 404 errors
 */

const axios = require('axios');

const API_KEY = process.env.ELEVENLABS_API_KEY || 'd5423b6633aa2e5b795186d5de608c7b41fd707f8216c96be305f62a29751a9b';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'CdstIQ2imSePodQm8kjA';
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_v3';

console.log('🔍 ElevenLabs API Diagnostic Tool\n');
console.log('Configuration:');
console.log(`  API Key: ${API_KEY.substring(0, 20)}...${API_KEY.substring(API_KEY.length - 10)}`);
console.log(`  Voice ID: ${VOICE_ID}`);
console.log(`  Model ID: ${MODEL_ID}`);
console.log('\n' + '='.repeat(60) + '\n');

async function testAPI() {
  try {
    // Test 1: List all available voices
    console.log('📋 Test 1: Fetching available voices...');
    const voicesResponse = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': API_KEY
      }
    });

    console.log(`✅ Found ${voicesResponse.data.voices.length} available voices:\n`);
    voicesResponse.data.voices.forEach((voice, index) => {
      const isConfigured = voice.voice_id === VOICE_ID ? ' ⭐ (CONFIGURED)' : '';
      console.log(`  ${index + 1}. ${voice.name} (${voice.voice_id})${isConfigured}`);
    });

    // Check if configured voice exists
    const configuredVoice = voicesResponse.data.voices.find(v => v.voice_id === VOICE_ID);
    if (!configuredVoice) {
      console.log(`\n❌ ERROR: Configured voice ID "${VOICE_ID}" NOT FOUND in your account!`);
      console.log(`\nℹ️  This is likely why you're getting 404 errors.`);
      console.log(`\nSuggested fixes:`);
      console.log(`  1. Use one of the voice IDs listed above`);
      console.log(`  2. Or create/clone the voice in your ElevenLabs account`);
      return false;
    } else {
      console.log(`\n✅ Configured voice "${configuredVoice.name}" (${VOICE_ID}) exists in your account!`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 2: Try to generate a small test audio
    console.log('🎤 Test 2: Testing speech generation with configured voice...');
    const testText = 'Hello, this is a test.';

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
    console.log(`\nRequest URL: ${url}`);
    console.log(`Request body: ${JSON.stringify({
      text: testText,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }, null, 2)}`);

    const response = await axios.post(url, {
      text: testText,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: false
      }
    }, {
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer',
      timeout: 30000
    });

    if (response.status === 200) {
      const audioSize = response.data.length;
      console.log(`\n✅ SUCCESS! Generated ${audioSize} bytes of audio`);
      console.log(`\n✨ Your ElevenLabs configuration is working correctly!`);
      console.log(`\nℹ️  The 404 errors you're seeing must be from something else.`);
      return true;
    }

  } catch (error) {
    console.log('\n❌ ERROR occurred:\n');

    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Status Text: ${error.response.statusText}`);

      if (error.response.status === 404) {
        console.log(`\n🔍 404 Error Details:`);
        console.log(`  - The voice ID "${VOICE_ID}" does not exist or is not accessible`);
        console.log(`  - Check if the voice was deleted or if you're using the wrong account`);
      } else if (error.response.status === 401) {
        console.log(`\n🔍 401 Error Details:`);
        console.log(`  - Your API key may be invalid or expired`);
      } else if (error.response.status === 422) {
        console.log(`\n🔍 422 Error Details:`);
        console.log(`  - The model "${MODEL_ID}" may not be compatible with this voice`);
      }

      try {
        const errorData = typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
        console.log(`Response: ${errorData}`);
      } catch (e) {
        console.log('Response: (unable to parse)');
      }
    } else if (error.request) {
      console.log('No response received from API');
      console.log('This might be a network issue');
    } else {
      console.log(`Error: ${error.message}`);
    }

    return false;
  }
}

testAPI().then(success => {
  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Tests failed - see errors above');
    process.exit(1);
  }
});
