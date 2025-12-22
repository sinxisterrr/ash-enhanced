"use strict";
//--------------------------------------------------------------
//  DATA INGEST - pulls txt/doc/docx files into LTM
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importDataFiles = importDataFiles;
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_js_1 = require("../utils/logger.js");
const DATA_DIR = path_1.default.resolve("data");
const MAX_SUMMARY_LENGTH = 4000;
function truncate(text) {
    if (text.length <= MAX_SUMMARY_LENGTH)
        return text.trim();
    return `${text.slice(0, MAX_SUMMARY_LENGTH).trim()} ...`;
}
async function readTxt(filePath) {
    return promises_1.default.readFile(filePath, "utf8");
}
async function readFileContents(filePath, ext) {
    switch (ext) {
        case ".txt":
            return readTxt(filePath);
        default:
            logger_js_1.logger.warn(`Unsupported data file type: ${ext} (${filePath})`);
            return "";
    }
}
async function importDataFiles() {
    try {
        if (!fs_1.default.existsSync(DATA_DIR))
            return [];
        const entries = await promises_1.default.readdir(DATA_DIR, { withFileTypes: true });
        const files = entries.filter((e) => e.isFile() && [".txt"].includes(path_1.default.extname(e.name).toLowerCase()));
        const memories = [];
        for (const file of files) {
            const ext = path_1.default.extname(file.name).toLowerCase();
            const fullPath = path_1.default.join(DATA_DIR, file.name);
            try {
                const text = (await readFileContents(fullPath, ext)).trim();
                if (!text)
                    continue;
                const stats = await promises_1.default.stat(fullPath);
                const summary = truncate(text);
                memories.push({
                    summary: `File ${file.name}: ${summary}`,
                    type: "data-import",
                    enabled: true,
                    source: `data-file:${file.name}`,
                    tags: ["data-import", ext.replace(".", "")],
                    createdAt: Math.round(stats.mtimeMs || Date.now()),
                });
            }
            catch (err) {
                logger_js_1.logger.warn(`Failed to import data file ${file.name}:`, err);
            }
        }
        return memories;
    }
    catch (err) {
        logger_js_1.logger.warn("Data import failed:", err);
        return [];
    }
}
