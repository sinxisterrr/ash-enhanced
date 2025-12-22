"use strict";
// FILE: src/utils/logger.ts
//--------------------------------------------------------------
// Ash’s logger — quiet when it should be, loud when it matters.
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function ts() {
    return new Date().toISOString();
}
function tag(level) {
    return `[${ts()}][Ash][${level}]`;
}
exports.logger = {
    info: (...args) => console.log(`ℹ️ ${tag("INFO")}`, ...args),
    warn: (...args) => console.warn(`⚠️ ${tag("WARN")}`, ...args),
    error: (...args) => console.error(`❌ ${tag("ERROR")}`, ...args),
    debug: (...args) => {
        if (process.env.DEBUG === "true") {
            console.log(`🐛 ${tag("DEBUG")}`, ...args);
        }
    },
};
