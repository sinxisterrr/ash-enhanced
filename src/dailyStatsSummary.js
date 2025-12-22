"use strict";
/**
 * DAILY STATS SUMMARY
 * ===================
 *
 * Automatische tägliche Zusammenfassung um 0:00 Uhr:
 * - Letta Stats (gestern)
 * - Chat Statistik (gestern)
 *
 * Läuft direkt im Bot, nicht als Agent-Task
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyStatsSummary = sendDailyStatsSummary;
exports.startDailyStatsSummaryScheduler = startDailyStatsSummaryScheduler;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Configuration
const TARGET_CHANNEL_ID = process.env.LETTA_ALERT_CHANNEL_ID || ""; // Configure in .env
// Auto-detect PI or Mac path
const fs_1 = __importDefault(require("fs"));
const PI_SCRIPT_PATH = path_1.default.join(process.env.HOME || "~", "miore-discord-bot", "daily_stats_summary.py");
const MAC_SCRIPT_PATH = path_1.default.join(__dirname, "..", "..", "daily_stats_summary.py");
const SCRIPT_PATH = fs_1.default.existsSync(PI_SCRIPT_PATH) ? PI_SCRIPT_PATH : MAC_SCRIPT_PATH;
// State
let dailyStatsScheduled = false;
/**
 * Send daily stats summary (Letta + Chat Stats)
 */
async function sendDailyStatsSummary(client) {
    try {
        console.log("📊 Starting daily stats summary...");
        // Get target channel
        const channel = (await client.channels.fetch(TARGET_CHANNEL_ID));
        if (!channel) {
            console.error(`❌ Channel ${TARGET_CHANNEL_ID} not found`);
            return;
        }
        // Execute Python script
        try {
            const { stdout, stderr } = await execAsync(`python3 "${SCRIPT_PATH}"`, {
                timeout: 30000, // 30 seconds timeout
                maxBuffer: 1024 * 1024 // 1MB
            });
            if (stderr && !stderr.includes("⚠️")) {
                console.warn(`⚠️  Script warnings: ${stderr}`);
            }
            // Script should send message itself via Discord API
            // But we can also check if it succeeded
            if (stdout.includes("✅ Nachricht erfolgreich gesendet")) {
                console.log("✅ Daily stats summary sent successfully");
            }
            else {
                console.log(`📊 Script output: ${stdout}`);
            }
        }
        catch (error) {
            console.error("❌ Error executing daily_stats_summary.py:", error);
            // Send error message to channel
            await channel.send(`❌ **Fehler beim Erstellen der täglichen Zusammenfassung:**\n\`\`\`${error.message}\`\`\``);
        }
    }
    catch (error) {
        console.error("❌ Error in sendDailyStatsSummary:", error);
    }
}
/**
 * Start daily stats summary scheduler (runs at 0:00 in configured timezone)
 */
function startDailyStatsSummaryScheduler(client) {
    if (dailyStatsScheduled) {
        console.log("⚠️  Daily stats summary scheduler already running");
        return;
    }
    dailyStatsScheduled = true;
    const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin';
    console.log(`📅 Daily stats summary scheduler started (runs at 0:00 ${TIMEZONE})`);
    function scheduleNextMidnight() {
        const now = new Date();
        // Get configured timezone time
        const berlinTime = new Intl.DateTimeFormat("en-US", {
            timeZone: TIMEZONE,
            hour: "numeric",
            minute: "numeric",
            hour12: false,
        }).formatToParts(now);
        const hour = parseInt(berlinTime.find((p) => p.type === "hour")?.value || "0", 10);
        const minute = parseInt(berlinTime.find((p) => p.type === "minute")?.value || "0", 10);
        // Calculate milliseconds until next midnight (configured timezone)
        const berlinNow = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
        const berlinMidnight = new Date(berlinNow);
        berlinMidnight.setHours(0, 0, 0, 0);
        berlinMidnight.setDate(berlinMidnight.getDate() + 1); // Next midnight
        const msUntilMidnight = berlinMidnight.getTime() - berlinNow.getTime();
        console.log(`⏰ Next daily stats summary scheduled in ${Math.floor(msUntilMidnight / 1000 / 60)} minutes (at 0:00 ${TIMEZONE})`);
        setTimeout(async () => {
            await sendDailyStatsSummary(client);
            // Schedule next day
            scheduleNextMidnight();
        }, msUntilMidnight);
    }
    // Start scheduling
    scheduleNextMidnight();
}
