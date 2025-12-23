//--------------------------------------------------------------
// Central Nervous System - SOMA bridge for the Discord bot
//--------------------------------------------------------------

import { ActionParser, SOMA, Stimulus, StimulusProcessor } from "./soma.js";
import { logger } from "../utils/logger.js";

export interface VitalsSummary {
  arousal: number;
  pleasure: number;
  pain: number;
  fatigue: number;
  heartRate: number;
  breathRate: number;
  musclesTension: number;
  focus: number;
  edgeStability: number;
}

export class CentralNervousSystem {
  private soma: SOMA;

  constructor(userId = "bot") {
    this.soma = new SOMA(userId);
  }

  update() {
    this.soma.update();
  }

  applyStimulus(stimulus: Stimulus) {
    logger.debug(`[SOMA] Applying stimulus: ${stimulus.type} (intensity: ${stimulus.intensity}, zone: ${stimulus.zone || "general"})`);
    StimulusProcessor.apply(this.soma, stimulus);
  }

  applyText(text: string) {
    this.soma.update();
    const stimuli = ActionParser.parse(text);
    if (stimuli.length > 0) {
      logger.debug(`[SOMA] Parsed ${stimuli.length} stimuli from text: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);
      for (const stimulus of stimuli) {
        logger.debug(`[SOMA] → ${stimulus.type} (intensity: ${stimulus.intensity}, zone: ${stimulus.zone || "general"})`);
        StimulusProcessor.apply(this.soma, stimulus);
      }
    }
  }

  getSummary(): VitalsSummary {
    const arousal = this.soma.sensation.arousal;
    const edgePressure = Math.max(0, arousal - 70);
    const momentumPenalty = Math.max(0, this.soma.arousalMomentum) * 2;
    const edgePenalty = this.soma.edgeCount * 5;
    const edgeStability = Math.max(
      0,
      Math.min(100, 100 - edgePressure * 1.8 - momentumPenalty - edgePenalty)
    );

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

