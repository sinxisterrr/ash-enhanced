"use strict";
//--------------------------------------------------------------
// Central Nervous System - SOMA bridge for the Discord bot
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.CentralNervousSystem = void 0;
const soma_js_1 = require("./soma.js");
const logger_js_1 = require("../utils/logger.js");
class CentralNervousSystem {
    constructor(userId = "bot") {
        this.soma = new soma_js_1.SOMA(userId);
    }
    update() {
        this.soma.update();
    }
    applyStimulus(stimulus) {
        logger_js_1.logger.debug(`[SOMA] Applying stimulus: ${stimulus.type} (intensity: ${stimulus.intensity}, zone: ${stimulus.zone || "general"})`);
        soma_js_1.StimulusProcessor.apply(this.soma, stimulus);
    }
    applyText(text) {
        this.soma.update();
        const stimuli = soma_js_1.ActionParser.parse(text);
        if (stimuli.length > 0) {
            logger_js_1.logger.debug(`[SOMA] Parsed ${stimuli.length} stimuli from text: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);
            for (const stimulus of stimuli) {
                logger_js_1.logger.debug(`[SOMA] → ${stimulus.type} (intensity: ${stimulus.intensity}, zone: ${stimulus.zone || "general"})`);
                soma_js_1.StimulusProcessor.apply(this.soma, stimulus);
            }
        }
    }
    getSummary() {
        const arousal = this.soma.sensation.arousal;
        const edgePressure = Math.max(0, arousal - 70);
        const momentumPenalty = Math.max(0, this.soma.arousalMomentum) * 2;
        const edgePenalty = this.soma.edgeCount * 5;
        const edgeStability = Math.max(0, Math.min(100, 100 - edgePressure * 1.8 - momentumPenalty - edgePenalty));
        return {
            arousal,
            pleasure: this.soma.sensation.pleasure,
            pain: this.soma.sensation.pain,
            fatigue: this.soma.energy.fatigue,
            heartRate: this.soma.physiology.heartRate,
            breathRate: this.soma.physiology.breathingRate,
            musclesTension: this.soma.physiology.muscleTension,
            focus: this.soma.cognition.focus,
            edgeStability,
        };
    }
    getExperience() {
        return this.soma.getExperienceDescription();
    }
    getModelTemperature() {
        return this.soma.getModelTemperature();
    }
    toString() {
        return this.soma.toString();
    }
}
exports.CentralNervousSystem = CentralNervousSystem;
