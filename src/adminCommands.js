"use strict";
/**
 * ADMIN COMMAND HANDLER
 * =====================
 *
 * Allows authorized users to execute admin commands via Discord
 *
 * SECURITY:
 * - Only works for ADMIN_USER_ID (set in .env)
 * - Logs all command attempts for audit
 * - Validates commands before execution
 * - Rate limited to prevent abuse
 *
 * Commands:
 * - !pm2 list              → Show all PM2 processes
 * - !pm2 stop <name|all>   → Stop process(es)
 * - !pm2 restart <name|all> → Restart process(es)
 * - !pm2 logs <name>       → Show recent logs (last 20 lines)
 * - !system status         → Show system info (uptime, memory, CPU)
 * - !bot stats             → Show bot stats (autonomous system stats)
 *
 * Oct 16, 2025 - Remote Admin System
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminCommand = handleAdminCommand;
exports.getCommandLog = getCommandLog;
const child_process_1 = require("child_process");
const util_1 = require("util");
const autonomous_1 = require("./autonomous");
const getModelStatsCommand = async (_args) => "Model stats are not available in Ollama mode.";
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ===== CONFIGURATION =====
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || ''; // Admin Discord User ID
const COMMAND_COOLDOWN_MS = 2000; // 2 seconds between commands (anti-spam)
// ===== STATE =====
let lastCommandTime = 0;
const commandLog = [];
/**
 * Check if user is authorized admin
 */
function isAdmin(userId) {
    return userId === ADMIN_USER_ID;
}
/**
 * Log command execution for audit trail
 */
function logCommand(userId, username, command, success, error) {
    const logEntry = {
        timestamp: new Date(),
        userId,
        username,
        command,
        success,
        error
    };
    commandLog.push(logEntry);
    // Keep only last 100 commands
    if (commandLog.length > 100) {
        commandLog.shift();
    }
    // Console log for immediate visibility
    const status = success ? '✅' : '❌';
    console.log(`${status} ADMIN COMMAND [${username}]: ${command}`);
    if (error) {
        console.error(`   Error: ${error}`);
    }
}
/**
 * Execute PM2 command
 * SECURITY: Validates command before execution
 */
async function executePM2Command(args) {
    // Validate PM2 command
    const validCommands = ['list', 'ls', 'stop', 'restart', 'start', 'delete', 'logs', 'monit', 'status', 'info'];
    const command = args[0];
    if (!command || !validCommands.includes(command)) {
        throw new Error(`Invalid PM2 command. Valid: ${validCommands.join(', ')}`);
    }
    // Build safe command
    const pm2Command = `pm2 ${args.join(' ')}`;
    console.log(`🔧 Executing: ${pm2Command}`);
    try {
        const { stdout, stderr } = await execAsync(pm2Command, {
            timeout: 10000, // 10 second timeout
            maxBuffer: 1024 * 1024 // 1MB max output
        });
        return stdout || stderr || 'Command executed (no output)';
    }
    catch (error) {
        throw new Error(`PM2 command failed: ${error.message}`);
    }
}
/**
 * Get system status
 */
async function getSystemStatus() {
    try {
        const { stdout } = await execAsync('uptime && free -h && df -h / 2>/dev/null || uptime', {
            timeout: 5000
        });
        return stdout;
    }
    catch (error) {
        throw new Error(`System status failed: ${error.message}`);
    }
}
/**
 * Get bot stats from autonomous system
 */
function getBotStats(channelId, botUserId) {
    try {
        const stats = (0, autonomous_1.getConversationStats)(channelId, botUserId);
        const lines = [
            '🤖 **Bot Statistics**',
            '',
            `📊 Messages tracked: ${stats.messageCount}`,
            `🔁 Bot pingpong count: ${stats.botPingPongCount}/${stats.pingPongLimit}`,
            `📝 Consecutive self-messages: ${stats.consecutiveSelfMessages}/${stats.selfSpamLimit}`,
            `🔒 Cooldown active: ${stats.cooldownActive ? `YES (${Math.ceil(stats.cooldownRemaining / 1000)}s remaining)` : 'NO'}`,
            `👤 Time since last human: ${Math.floor(stats.timeSinceLastHuman / 1000)}s ago`,
            `🚨 Require human after cooldown: ${stats.requireHumanAfterCooldown ? 'YES' : 'NO'}`,
            `🔄 Involved in pingpong: ${stats.involvedInPingPong ? 'YES' : 'NO'}`
        ];
        return lines.join('\n');
    }
    catch (error) {
        throw new Error(`Bot stats failed: ${error.message}`);
    }
}
/**
 * Format output for Discord (respects 2000 char limit)
 */
function formatOutput(output) {
    // Truncate if too long
    if (output.length > 1900) {
        return '```\n' + output.substring(0, 1850) + '\n... (truncated)\n```';
    }
    return '```\n' + output + '\n```';
}
/**
 * Trigger manual conversation summarization
 * Reduces message history to keep memory manageable
 */
async function triggerSummarization(maxMessages = 20) {
    return [
        "🧠 **Local Memory Mode**",
        "",
        "Ollama mode uses local memory distillation instead of remote summarization.",
        `Target hint: ${maxMessages} messages (no remote summarization performed).`,
    ].join("\n");
}
/**
 * Handle admin command
 * Returns: response message or null if not a command
 */
async function handleAdminCommand(message, botUserId) {
    const content = message.content.trim();
    // Check if it's a command
    if (!content.startsWith('!')) {
        return null;
    }
    // Parse command
    const parts = content.slice(1).split(/\s+/);
    const mainCommand = parts[0].toLowerCase();
    const args = parts.slice(1);
    // SECURITY: Check if user is admin
    if (!isAdmin(message.author.id)) {
        logCommand(message.author.id, message.author.username, content, false, 'Unauthorized');
        return '🚫 **Access Denied**: You are not authorized to use admin commands.';
    }
    // SECURITY: Rate limiting
    const now = Date.now();
    if (now - lastCommandTime < COMMAND_COOLDOWN_MS) {
        const remainingMs = COMMAND_COOLDOWN_MS - (now - lastCommandTime);
        return `⏱️ **Rate Limited**: Please wait ${Math.ceil(remainingMs / 1000)}s before next command.`;
    }
    lastCommandTime = now;
    try {
        let response;
        switch (mainCommand) {
            case 'pm2':
                if (args.length === 0) {
                    response = '📋 **PM2 Commands**:\n' +
                        '• `!pm2 list` - Show all processes\n' +
                        '• `!pm2 stop <name|all>` - Stop process(es)\n' +
                        '• `!pm2 restart <name|all>` - Restart process(es)\n' +
                        '• `!pm2 logs <name> --lines 20` - Show logs\n' +
                        '• `!pm2 info <name>` - Show process info';
                    break;
                }
                const output = await executePM2Command(args);
                response = `✅ **PM2 Command**: \`pm2 ${args.join(' ')}\`\n\n${formatOutput(output)}`;
                break;
            case 'system':
                if (args[0] === 'status') {
                    const sysOutput = await getSystemStatus();
                    response = `📊 **System Status**\n\n${formatOutput(sysOutput)}`;
                }
                else {
                    response = '📋 **System Commands**:\n• `!system status` - Show system info';
                }
                break;
            case 'bot':
                if (args[0] === 'stats') {
                    const botStats = getBotStats(message.channel.id, botUserId);
                    response = botStats;
                }
                else {
                    response = '📋 **Bot Commands**:\n• `!bot stats` - Show bot statistics';
                }
                break;
            case 'model-stats':
            case 'credits':
            case 'letta':
                response = await getModelStatsCommand(args);
                break;
            case 'sum':
            case 'zusammenfassen': // Backward compatibility
                const maxMessages = args[0] ? parseInt(args[0]) : 20;
                if (isNaN(maxMessages) || maxMessages < 5 || maxMessages > 100) {
                    response = '❌ **Invalid argument**: Please provide a number between 5 and 100.\nExample: `!zusammenfassen 20`';
                }
                else {
                    response = await triggerSummarization(maxMessages);
                }
                break;
            case 'timeusage':
            case 'time':
            case 'chat-stats':
                try {
                    // Get script path from environment variable
                    const scriptPath = process.env.STATS_SCRIPT_PATH || '~/discord-bot/get_current_chat_stats.py';
                    const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`, {
                        timeout: 10000, // 10 second timeout
                        maxBuffer: 1024 * 1024 // 1MB max output
                    });
                    if (stderr && !stdout) {
                        throw new Error(stderr);
                    }
                    response = stdout || 'Keine Daten verfügbar';
                }
                catch (error) {
                    throw new Error(`Chat-Statistik fehlgeschlagen: ${error.message}`);
                }
                break;
            case 'help':
                response = '🛠️ **Admin Commands**\n\n' +
                    '**PM2 Control**\n' +
                    '• `!pm2 list` - Show processes\n' +
                    '• `!pm2 stop <name|all>` - Stop\n' +
                    '• `!pm2 restart <name|all>` - Restart\n' +
                    '• `!pm2 logs <name>` - Show logs\n\n' +
                    '**System**\n' +
                    '• `!system status` - System info\n' +
                    '• `!bot stats` - Bot statistics\n\n' +
                    '**Model Stats**\n' +
                    '• `!model-stats` - Show model usage (if available)\n' +
                    '• `!credits` - Alias for model-stats\n\n' +
                    '**Conversation Management**\n' +
                    '• `!zusammenfassen [20]` - Summarize conversation (keep N messages, default: 20)\n' +
                    '• `!sum [20]` - Same as zusammenfassen\n\n' +
                    '**Chat Stats**\n' +
                    '• `!timeusage` - Show current chat statistics (hours & messages)\n' +
                    '• `!time` - Same as timeusage\n' +
                    '• `!chat-stats` - Same as timeusage\n\n' +
                    '**Other**\n' +
                    '• `!help` - Show this message';
                break;
            default:
                response = `❓ Unknown command: \`${mainCommand}\`\nUse \`!help\` for available commands.`;
        }
        logCommand(message.author.id, message.author.username, content, true);
        return response;
    }
    catch (error) {
        logCommand(message.author.id, message.author.username, content, false, error.message);
        return `❌ **Command Failed**: ${error.message}`;
    }
}
/**
 * Get command log for audit
 */
function getCommandLog(limit = 20) {
    return commandLog.slice(-limit);
}
