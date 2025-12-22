//--------------------------------------------------------------
// Vitals Logger - lightweight periodic logging for SOMA vitals
//--------------------------------------------------------------

import { logger } from "../../utils/logger.js";
import { CentralNervousSystem } from "../CentralNervousSystem.js";

export class VitalsLogger {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private body: CentralNervousSystem,
    private intervalMs = 60_000
  ) {
    this.start();
  }

  private start() {
    this.interval = setInterval(() => {
      const vitals = this.body.getSummary();
      logger.debug(
        `Vitals | arousal=${Math.round(vitals.arousal)} pleasure=${Math.round(vitals.pleasure)} ` +
          `fatigue=${Math.round(vitals.fatigue)} hr=${Math.round(vitals.heartRate)} ` +
          `br=${Math.round(vitals.breathRate)} focus=${Math.round(vitals.focus)}`
      );
    }, this.intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

