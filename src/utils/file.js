"use strict";
// FILE: src/utils/file.ts
//--------------------------------------------------------------
//  Low-level file helpers for Ash
//  Safe JSON read/write with atomic writes
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeJSON = writeJSON;
exports.readJSON = readJSON;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Ensure directory exists before writing
function ensureDir(filePath) {
    const dir = path_1.default.dirname(filePath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
//--------------------------------------------------------------
//  WRITE JSON (atomic)
//--------------------------------------------------------------
async function writeJSON(filePath, data) {
    return new Promise((resolve, reject) => {
        try {
            ensureDir(filePath);
            const temp = filePath + ".tmp";
            const json = JSON.stringify(data, null, 2);
            fs_1.default.writeFile(temp, json, "utf8", (err) => {
                if (err)
                    return reject(err);
                // Atomic replace
                fs_1.default.rename(temp, filePath, (err) => {
                    if (err)
                        return reject(err);
                    resolve();
                });
            });
        }
        catch (err) {
            reject(err);
        }
    });
}
//--------------------------------------------------------------
//  READ JSON
//--------------------------------------------------------------
async function readJSON(filePath, fallback) {
    return new Promise((resolve) => {
        try {
            if (!fs_1.default.existsSync(filePath)) {
                return resolve(fallback);
            }
            fs_1.default.readFile(filePath, "utf8", (err, data) => {
                if (err)
                    return resolve(fallback);
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                }
                catch {
                    resolve(fallback);
                }
            });
        }
        catch {
            resolve(fallback);
        }
    });
}
