"use strict";
//--------------------------------------------------------------
// Central Nervous System - SOMA bridge for the Discord bot
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.CentralNervousSystem = void 0;
const soma_js_1 = require("./soma.js");
class CentralNervousSystem {
    constructor(userId = "bot") {
        this.soma = new soma_js_1.SOMA(userId);
    }
    update() {
        this.soma.update();
    }
    applyStimulus(stimulus) {
        soma_js_1.StimulusProcessor.apply(this.soma, stimulus);
    }
    applyText(text) {
        this.soma.update();
        const stimuli = soma_js_1.ActionParser.parse(text);
        for (const stimulus of stimuli) {
            soma_js_1.StimulusProcessor.apply(this.soma, stimulus);
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
}
exports.CentralNervousSystem = CentralNervousSystem;
