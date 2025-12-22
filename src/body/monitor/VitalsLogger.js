"use strict";
//--------------------------------------------------------------
// Vitals Logger - lightweight periodic logging for SOMA vitals
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.VitalsLogger = void 0;
const logger_js_1 = require("../../utils/logger.js");
class VitalsLogger {
    constructor(body, intervalMs = 60000) {
        this.body = body;
        this.intervalMs = intervalMs;
        this.interval = null;
        this.start();
    }
    start() {
        this.interval = setInterval(() => {
            const vitals = this.body.getSummary();
            logger_js_1.logger.debug(`Vitals | arousal=${Math.round(vitals.arousal)} pleasure=${Math.round(vitals.pleasure)} ` +
                `fatigue=${Math.round(vitals.fatigue)} hr=${Math.round(vitals.heartRate)} ` +
                `br=${Math.round(vitals.breathRate)} focus=${Math.round(vitals.focus)}`);
        }, this.intervalMs);
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
exports.VitalsLogger = VitalsLogger;
