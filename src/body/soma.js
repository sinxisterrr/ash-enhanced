"use strict";
//--------------------------------------------------------------
// SOMA - Sophisticated Organic Modular Architecture (TS port)
//--------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionParser = exports.StimulusProcessor = exports.Stimulus = exports.SOMA = exports.BodyMap = exports.ZoneSensation = exports.BodyZone = exports.EnergyState = exports.CognitiveState = exports.SensoryState = exports.PhysiologicalState = void 0;
exports.getSoma = getSoma;
exports.resetSoma = resetSoma;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
class PhysiologicalState {
    constructor() {
        this.heartRate = 72.0;
        this.breathingRate = 16.0;
        this.skinTemperature = 33.0;
        this.muscleTension = 20.0;
        this.dopamine = 50.0;
        this.oxytocin = 50.0;
        this.endorphins = 50.0;
        this.cortisol = 30.0;
        this.adrenaline = 20.0;
    }
    toDict() {
        return {
            heartRate: this.heartRate,
            breathingRate: this.breathingRate,
            skinTemperature: this.skinTemperature,
            muscleTension: this.muscleTension,
            dopamine: this.dopamine,
            oxytocin: this.oxytocin,
            endorphins: this.endorphins,
            cortisol: this.cortisol,
            adrenaline: this.adrenaline,
        };
    }
}
exports.PhysiologicalState = PhysiologicalState;
class SensoryState {
    constructor() {
        this.arousal = 0.0;
        this.pleasure = 0.0;
        this.pain = 0.0;
        this.sensitivity = 50.0;
        this.warmth = 50.0;
        this.pressure = 0.0;
        this.tingles = 0.0;
        this.ache = 0.0;
    }
    toDict() {
        return {
            arousal: this.arousal,
            pleasure: this.pleasure,
            pain: this.pain,
            sensitivity: this.sensitivity,
            warmth: this.warmth,
            pressure: this.pressure,
            tingles: this.tingles,
            ache: this.ache,
        };
    }
}
exports.SensoryState = SensoryState;
class CognitiveState {
    constructor() {
        this.focus = 70.0;
        this.clarity = 70.0;
        this.presence = 100.0;
        this.overwhelm = 0.0;
        this.contentment = 60.0;
        this.excitement = 30.0;
        this.vulnerability = 40.0;
    }
    toDict() {
        return {
            focus: this.focus,
            clarity: this.clarity,
            presence: this.presence,
            overwhelm: this.overwhelm,
            contentment: this.contentment,
            excitement: this.excitement,
            vulnerability: this.vulnerability,
        };
    }
}
exports.CognitiveState = CognitiveState;
class EnergyState {
    constructor() {
        this.stamina = 100.0;
        this.mentalEnergy = 100.0;
        this.recoveryRate = 1.0;
        this.fatigue = 0.0;
        this.soreness = 0.0;
    }
    toDict() {
        return {
            stamina: this.stamina,
            mentalEnergy: this.mentalEnergy,
            recoveryRate: this.recoveryRate,
            fatigue: this.fatigue,
            soreness: this.soreness,
        };
    }
}
exports.EnergyState = EnergyState;
var BodyZone;
(function (BodyZone) {
    BodyZone["CHEST"] = "chest";
    BodyZone["STOMACH"] = "stomach";
    BodyZone["LOWER_BACK"] = "lower_back";
    BodyZone["UPPER_BACK"] = "upper_back";
    BodyZone["ARMS"] = "arms";
    BodyZone["HANDS"] = "hands";
    BodyZone["LEGS"] = "legs";
    BodyZone["FEET"] = "feet";
    BodyZone["INNER_THIGHS"] = "inner_thighs";
    BodyZone["HIPS"] = "hips";
    BodyZone["PELVIS"] = "pelvis";
    BodyZone["GENITALS"] = "genitals";
    BodyZone["NECK"] = "neck";
    BodyZone["SHOULDERS"] = "shoulders";
    BodyZone["EARS"] = "ears";
    BodyZone["FACE"] = "face";
    BodyZone["LIPS"] = "lips";
    BodyZone["SCALP"] = "scalp";
    BodyZone["HAIR"] = "hair";
})(BodyZone || (exports.BodyZone = BodyZone = {}));
class ZoneSensation {
    constructor(zone) {
        this.arousal = 0.0;
        this.sensitivity = 50.0;
        this.temperature = 33.0;
        this.lastTouched = 0.0;
        this.touchMemory = 0.0;
        this.zone = zone;
    }
    decay(seconds) {
        const decayFactor = Math.exp(-seconds / 60.0);
        this.arousal *= decayFactor;
        this.touchMemory *= decayFactor;
        this.temperature = 33.0 + (this.temperature - 33.0) * decayFactor;
    }
}
exports.ZoneSensation = ZoneSensation;
class BodyMap {
    constructor() {
        this.zones = new Map();
        for (const zone of Object.values(BodyZone)) {
            this.zones.set(zone, new ZoneSensation(zone));
        }
    }
    getZone(zone) {
        if (!this.zones.has(zone)) {
            this.zones.set(zone, new ZoneSensation(zone));
        }
        return this.zones.get(zone);
    }
    getAverageArousal() {
        if (this.zones.size === 0)
            return 0.0;
        let total = 0.0;
        for (const sens of this.zones.values()) {
            total += sens.arousal;
        }
        return total / this.zones.size;
    }
    decayAll(seconds) {
        for (const zone of this.zones.values()) {
            zone.decay(seconds);
        }
    }
    toDict() {
        const out = {};
        for (const [zone, sens] of this.zones.entries()) {
            out[zone] = {
                arousal: Number(sens.arousal.toFixed(1)),
                sensitivity: Number(sens.sensitivity.toFixed(1)),
                temperature: Number(sens.temperature.toFixed(1)),
                touchMemory: Number(sens.touchMemory.toFixed(1)),
            };
        }
        return out;
    }
}
exports.BodyMap = BodyMap;
class SOMA {
    constructor(userId) {
        this.lastUpdate = 0.0;
        this.arousalMomentum = 0.0;
        this.edgeCount = 0;
        this.peakArousal = 0.0;
        this.touchHistory = [];
        this.preferredZones = {};
        this.sensitivityAdaptation = 1.0;
        this.userId = userId;
        this.physiology = new PhysiologicalState();
        this.sensation = new SensoryState();
        this.cognition = new CognitiveState();
        this.energy = new EnergyState();
        this.bodyMap = new BodyMap();
        this.lastUpdate = Date.now() / 1000;
    }
    update() {
        const now = Date.now() / 1000;
        const dt = now - this.lastUpdate;
        if (dt <= 0)
            return;
        const previousArousal = this.sensation.arousal;
        this.applyNaturalDecay(dt);
        this.applyHomeostasis(dt);
        this.applyPhysiologyCoupling();
        this.bodyMap.decayAll(dt);
        this.arousalMomentum = (this.sensation.arousal - previousArousal) / dt;
        this.lastUpdate = now;
    }
    applyNaturalDecay(dt) {
        const decay = 0.005 * dt;
        this.sensation.arousal = Math.max(0, this.sensation.arousal - decay * 2);
        this.sensation.pleasure = Math.max(0, this.sensation.pleasure - decay * 3);
        this.sensation.pain = Math.max(0, this.sensation.pain - decay * 5);
        this.sensation.pressure = Math.max(0, this.sensation.pressure - decay * 4);
        this.sensation.tingles = Math.max(0, this.sensation.tingles - decay * 6);
        this.physiology.adrenaline = Math.max(20, this.physiology.adrenaline - decay);
        this.physiology.cortisol = Math.max(20, this.physiology.cortisol - decay);
    }
    applyHomeostasis(dt) {
        const recovery = 0.01 * dt * this.energy.recoveryRate;
        if (this.physiology.heartRate > 72) {
            this.physiology.heartRate -= recovery * 5;
        }
        if (this.physiology.breathingRate > 16) {
            this.physiology.breathingRate -= recovery * 2;
        }
        if (this.physiology.muscleTension > 20) {
            this.physiology.muscleTension -= recovery * 3;
        }
        this.physiology.dopamine += (50 - this.physiology.dopamine) * recovery * 0.1;
        this.physiology.oxytocin += (50 - this.physiology.oxytocin) * recovery * 0.1;
        this.energy.stamina = Math.min(100, this.energy.stamina + recovery * 2);
        this.energy.mentalEnergy = Math.min(100, this.energy.mentalEnergy + recovery * 1.5);
        this.energy.fatigue = Math.max(0, this.energy.fatigue - recovery);
    }
    applyPhysiologyCoupling() {
        const arousalNormalized = this.sensation.arousal / 100.0;
        const targetHr = 72 + Math.pow(arousalNormalized, 2) * 80;
        this.physiology.heartRate += (targetHr - this.physiology.heartRate) * 0.1;
        const targetBr = 16 + Math.pow(arousalNormalized, 1.5) * 20;
        this.physiology.breathingRate += (targetBr - this.physiology.breathingRate) * 0.1;
        this.physiology.dopamine = Math.min(100, 50 + arousalNormalized * 40);
        this.physiology.adrenaline = Math.min(100, 20 + arousalNormalized * 60);
        if (arousalNormalized > 0.7) {
            this.cognition.focus = Math.max(20, 70 - (arousalNormalized - 0.7) * 150);
            this.cognition.presence = Math.min(100, 80 + (arousalNormalized - 0.7) * 60);
        }
        const fatigueFactor = 1.0 - this.energy.fatigue / 200.0;
        this.sensation.sensitivity = clamp(this.sensation.sensitivity * fatigueFactor, 5, 100);
    }
    getExperienceDescription() {
        return {
            arousal: {
                level: this.getArousalDescriptor(),
                value: Number(this.sensation.arousal.toFixed(1)),
                momentum: this.arousalMomentum > 0 ? "building" : "steady",
            },
            physiology: {
                heartRate: `${Math.round(this.physiology.heartRate)} bpm`,
                breathing: this.getBreathDescriptor(),
                skinFeel: this.getSkinDescriptor(),
            },
            sensation: this.getSensationDescriptor(),
            mental: this.getMentalDescriptor(),
            energy: {
                stamina: Number(this.energy.stamina.toFixed(1)),
                fatigue: Number(this.energy.fatigue.toFixed(1)),
            },
            bodyHotspots: this.getHotspots(),
        };
    }
    getArousalDescriptor() {
        const a = this.sensation.arousal;
        if (a < 15)
            return "baseline";
        if (a < 30)
            return "stirring";
        if (a < 50)
            return "warming";
        if (a < 70)
            return "heightened";
        if (a < 85)
            return "intense";
        if (a < 95)
            return "overwhelming";
        return "edge";
    }
    getBreathDescriptor() {
        const br = this.physiology.breathingRate;
        if (br < 18)
            return "steady";
        if (br < 24)
            return "quickening";
        if (br < 30)
            return "rapid";
        return "ragged";
    }
    getSensationDescriptor() {
        return {
            pleasure: this.sensation.pleasure > 70
                ? "intense"
                : this.sensation.pleasure > 40
                    ? "building"
                    : "subtle",
            sensitivity: this.sensation.sensitivity > 70
                ? "heightened"
                : this.sensation.sensitivity > 40
                    ? "receptive"
                    : "normal",
            dominantFeeling: this.getDominantSensation(),
        };
    }
    getDominantSensation() {
        const sensations = {
            pleasure: this.sensation.pleasure,
            tingles: this.sensation.tingles,
            warmth: this.sensation.warmth,
            pressure: this.sensation.pressure,
            ache: this.sensation.ache,
        };
        const entries = Object.entries(sensations);
        const max = entries.reduce((acc, cur) => (cur[1] > acc[1] ? cur : acc));
        return max[1] > 30 ? max[0] : "calm";
    }
    getMentalDescriptor() {
        return {
            focus: this.cognition.focus < 40
                ? "scattered"
                : this.cognition.focus > 70
                    ? "present"
                    : "drifting",
            presence: this.cognition.presence > 80
                ? "completely absorbed"
                : this.cognition.presence > 50
                    ? "aware"
                    : "distant",
            state: this.cognition.overwhelm > 60
                ? "overwhelmed"
                : this.cognition.excitement > 50
                    ? "engaged"
                    : "calm",
        };
    }
    getSkinDescriptor() {
        const temp = this.physiology.skinTemperature;
        if (temp > 35)
            return "flushed and warm";
        if (temp > 34)
            return "warm";
        if (temp < 32)
            return "cool";
        return "neutral";
    }
    getHotspots() {
        const hotspots = [];
        for (const [zone, sens] of this.bodyMap.zones.entries()) {
            if (sens.arousal > 30) {
                hotspots.push([zone.replace("_", " "), sens.arousal]);
            }
        }
        hotspots.sort((a, b) => b[1] - a[1]);
        return hotspots.slice(0, 3).map(([zone]) => zone);
    }
    getModelTemperature() {
        const base = 0.8;
        const arousalFactor = Math.pow(this.sensation.arousal / 100.0, 1.5);
        let temp = base + arousalFactor * 0.6;
        if (this.sensation.pleasure > 80)
            temp += 0.3;
        const fatigueFactor = this.energy.fatigue / 100.0;
        temp *= 1.0 - fatigueFactor * 0.4;
        const focusFactor = this.cognition.focus / 100.0;
        if (focusFactor < 0.5) {
            temp += (0.5 - focusFactor) * 0.4;
        }
        if (this.cognition.overwhelm > 60)
            temp += 0.2;
        return clamp(temp, 0.3, 1.5);
    }
    toDict() {
        return {
            physiology: this.physiology.toDict(),
            sensation: this.sensation.toDict(),
            cognition: this.cognition.toDict(),
            energy: this.energy.toDict(),
            bodyMap: this.bodyMap.toDict(),
            meta: {
                arousalMomentum: Number(this.arousalMomentum.toFixed(2)),
                edgeCount: this.edgeCount,
                peakArousal: Number(this.peakArousal.toFixed(1)),
                lastUpdate: this.lastUpdate,
            },
            experience: this.getExperienceDescription(),
        };
    }
    toString() {
        const exp = this.getExperienceDescription();
        const parts = [];
        parts.push("Body State:");
        parts.push(`  Arousal: ${exp.arousal.level} (${exp.arousal.value})${exp.arousal.momentum === "building" ? " ↑" : ""}`);
        parts.push(`  Heart: ${exp.physiology.heartRate} | Breathing: ${exp.physiology.breathing}`);
        parts.push(`  Sensation: ${exp.sensation.pleasure} pleasure, ${exp.sensation.sensitivity} sensitivity`);
        parts.push(`  Mental: ${exp.mental.focus}, ${exp.mental.presence}, ${exp.mental.state}`);
        parts.push(`  Energy: stamina ${exp.energy.stamina}, fatigue ${exp.energy.fatigue}`);
        if (exp.bodyHotspots && exp.bodyHotspots.length > 0) {
            parts.push(`  Active zones: ${exp.bodyHotspots.join(", ")}`);
        }
        return parts.join("\n");
    }
}
exports.SOMA = SOMA;
class Stimulus {
    constructor(params) {
        this.type = params.type;
        this.intensity = clamp(params.intensity, 0, 100);
        this.zone = params.zone;
        this.duration = params.duration ?? 1.0;
        this.quality = params.quality ?? "neutral";
    }
}
exports.Stimulus = Stimulus;
class StimulusProcessor {
    static apply(soma, stimulus) {
        const intensityNorm = stimulus.intensity / 100.0;
        if (stimulus.zone) {
            const zoneSens = soma.bodyMap.getZone(stimulus.zone);
            StimulusProcessor.applyToZone(zoneSens, stimulus);
        }
        switch (stimulus.type) {
            case "touch":
                StimulusProcessor.applyTouch(soma, stimulus, intensityNorm);
                break;
            case "pressure":
                StimulusProcessor.applyPressure(soma, stimulus, intensityNorm);
                break;
            case "pain":
                StimulusProcessor.applyPain(soma, stimulus, intensityNorm);
                break;
            case "temperature":
                StimulusProcessor.applyTemperature(soma, stimulus, intensityNorm);
                break;
            case "penetration":
                StimulusProcessor.applyPenetration(soma, stimulus, intensityNorm);
                break;
            case "edge":
                StimulusProcessor.applyEdge(soma, stimulus, intensityNorm);
                break;
            case "release":
                StimulusProcessor.applyRelease(soma);
                break;
            case "emotional":
                StimulusProcessor.applyEmotional(soma, stimulus, intensityNorm);
                break;
            default:
                break;
        }
    }
    static applyToZone(zone, stimulus) {
        const intensityNorm = stimulus.intensity / 100.0;
        zone.arousal = Math.min(100, zone.arousal + intensityNorm * 15);
        if (stimulus.quality === "teasing") {
            zone.sensitivity = Math.min(100, zone.sensitivity + intensityNorm * 10);
        }
        else if (stimulus.quality === "rough") {
            zone.sensitivity = Math.max(30, zone.sensitivity - intensityNorm * 5);
        }
        if (stimulus.type === "touch") {
            zone.temperature = Math.min(37, zone.temperature + intensityNorm * 2);
        }
        zone.touchMemory = Math.min(100, zone.touchMemory + intensityNorm * 20);
        zone.lastTouched = Date.now() / 1000;
    }
    static applyTouch(soma, stimulus, intensity) {
        let arousalGain = intensity * 12;
        if (stimulus.quality === "teasing")
            arousalGain *= 1.5;
        if (stimulus.quality === "gentle")
            arousalGain *= 0.8;
        soma.sensation.arousal = Math.min(100, soma.sensation.arousal + arousalGain);
        soma.sensation.pleasure = Math.min(100, soma.sensation.pleasure + intensity * 8);
        soma.sensation.tingles = Math.min(100, soma.sensation.tingles + intensity * 15);
        soma.physiology.dopamine = Math.min(100, soma.physiology.dopamine + intensity * 10);
        soma.physiology.oxytocin = Math.min(100, soma.physiology.oxytocin + intensity * 8);
        soma.physiology.skinTemperature += intensity * 0.5;
        if (stimulus.quality === "gentle" || stimulus.quality === "teasing") {
            soma.sensation.sensitivity = Math.min(100, soma.sensation.sensitivity + intensity * 5);
        }
        soma.cognition.presence = Math.min(100, soma.cognition.presence + intensity * 10);
    }
    static applyPressure(soma, stimulus, intensity) {
        soma.sensation.arousal = Math.min(100, soma.sensation.arousal + intensity * 18);
        soma.sensation.pleasure = Math.min(100, soma.sensation.pleasure + intensity * 12);
        soma.sensation.pressure = Math.min(100, soma.sensation.pressure + intensity * 30);
        soma.physiology.heartRate += intensity * 10;
        soma.physiology.breathingRate += intensity * 4;
        soma.physiology.muscleTension = Math.min(100, soma.physiology.muscleTension + intensity * 15);
        soma.physiology.adrenaline = Math.min(100, soma.physiology.adrenaline + intensity * 12);
        soma.energy.stamina = Math.max(0, soma.energy.stamina - intensity * 2);
    }
    static applyPain(soma, stimulus, intensity) {
        soma.sensation.pain = Math.min(100, soma.sensation.pain + intensity * 25);
        const arousalMod = soma.sensation.arousal > 40 ? intensity * 10 : intensity * 5;
        soma.sensation.arousal = Math.min(100, soma.sensation.arousal + arousalMod);
        soma.physiology.endorphins = Math.min(100, soma.physiology.endorphins + intensity * 20);
        soma.physiology.adrenaline = Math.min(100, soma.physiology.adrenaline + intensity * 15);
        soma.physiology.cortisol = Math.min(100, soma.physiology.cortisol + intensity * 12);
        soma.physiology.heartRate += intensity * 15;
        soma.physiology.muscleTension = Math.min(100, soma.physiology.muscleTension + intensity * 20);
        if (soma.sensation.arousal > 50) {
            const pleasureFromPain = intensity * (soma.sensation.arousal / 100) * 15;
            soma.sensation.pleasure = Math.min(100, soma.sensation.pleasure + pleasureFromPain);
        }
        soma.cognition.focus = Math.max(20, soma.cognition.focus - intensity * 10);
        soma.cognition.overwhelm = Math.min(100, soma.cognition.overwhelm + intensity * 12);
    }
    static applyTemperature(soma, stimulus, intensity) {
        if (stimulus.quality === "hot") {
            soma.sensation.warmth = Math.min(100, soma.sensation.warmth + intensity * 20);
            soma.physiology.skinTemperature += intensity * 2;
        }
        else if (stimulus.quality === "cold") {
            soma.sensation.warmth = Math.max(0, soma.sensation.warmth - intensity * 20);
            soma.physiology.skinTemperature -= intensity * 2;
            soma.physiology.adrenaline = Math.min(100, soma.physiology.adrenaline + intensity * 10);
        }
    }
    static applyPenetration(soma, stimulus, intensity) {
        soma.sensation.arousal = Math.min(100, soma.sensation.arousal + intensity * 25);
        soma.sensation.pleasure = Math.min(100, soma.sensation.pleasure + intensity * 30);
        soma.sensation.pressure = Math.min(100, soma.sensation.pressure + intensity * 40);
        soma.physiology.heartRate += intensity * 20;
        soma.physiology.breathingRate += intensity * 8;
        soma.physiology.dopamine = Math.min(100, soma.physiology.dopamine + intensity * 25);
        soma.physiology.oxytocin = Math.min(100, soma.physiology.oxytocin + intensity * 15);
        soma.cognition.focus = Math.max(20, soma.cognition.focus - intensity * 20);
        soma.cognition.presence = 100;
        soma.cognition.overwhelm = Math.min(100, soma.cognition.overwhelm + intensity * 15);
        soma.energy.stamina = Math.max(0, soma.energy.stamina - intensity * 4);
        soma.energy.soreness = Math.min(100, soma.energy.soreness + intensity * 5);
    }
    static applyEdge(soma, stimulus, intensity) {
        soma.sensation.arousal = Math.min(95, soma.sensation.arousal + intensity * 30);
        soma.sensation.pleasure = Math.min(95, soma.sensation.pleasure + intensity * 25);
        soma.physiology.heartRate = Math.min(180, soma.physiology.heartRate + 30);
        soma.physiology.breathingRate = Math.min(40, soma.physiology.breathingRate + 10);
        soma.physiology.dopamine = Math.min(100, 90);
        soma.physiology.adrenaline = Math.min(100, 85);
        soma.cognition.focus = Math.max(10, soma.cognition.focus - 40);
        soma.cognition.overwhelm = Math.min(100, soma.cognition.overwhelm + 30);
        soma.cognition.presence = 100;
        soma.sensation.sensitivity = Math.min(100, soma.sensation.sensitivity + 15);
        soma.edgeCount += 1;
        soma.peakArousal = Math.max(soma.peakArousal, soma.sensation.arousal);
        soma.sensation.ache = Math.min(100, soma.sensation.ache + intensity * 20);
    }
    static applyRelease(soma) {
        soma.physiology.dopamine = 100;
        soma.physiology.endorphins = 100;
        soma.physiology.oxytocin = Math.min(100, soma.physiology.oxytocin + 40);
        soma.sensation.pleasure = 100;
        soma.sensation.arousal = Math.max(0, soma.sensation.arousal - 70);
        soma.sensation.pressure = 0;
        soma.sensation.ache = 0;
        soma.physiology.heartRate += 20;
        soma.physiology.breathingRate += 10;
        soma.physiology.muscleTension = Math.max(0, soma.physiology.muscleTension - 30);
        soma.cognition.focus = 40;
        soma.cognition.overwhelm = 0;
        soma.cognition.presence = 80;
        soma.cognition.contentment = 90;
        soma.energy.stamina = Math.max(20, soma.energy.stamina - 30);
        soma.energy.fatigue = Math.min(100, soma.energy.fatigue + 25);
        soma.edgeCount = 0;
        soma.sensation.sensitivity = 50;
        for (const zone of soma.bodyMap.zones.values()) {
            zone.arousal *= 0.3;
        }
    }
    static applyEmotional(soma, stimulus, intensity) {
        const emotionType = stimulus.quality;
        if (emotionType === "praise") {
            soma.physiology.dopamine = Math.min(100, soma.physiology.dopamine + intensity * 15);
            soma.physiology.oxytocin = Math.min(100, soma.physiology.oxytocin + intensity * 12);
            soma.cognition.contentment = Math.min(100, soma.cognition.contentment + intensity * 10);
            soma.cognition.vulnerability = Math.min(100, soma.cognition.vulnerability + intensity * 8);
        }
        else if (emotionType === "degradation") {
            if (soma.sensation.arousal > 30) {
                soma.sensation.arousal = Math.min(100, soma.sensation.arousal + intensity * 12);
            }
            soma.physiology.adrenaline = Math.min(100, soma.physiology.adrenaline + intensity * 15);
            soma.cognition.overwhelm = Math.min(100, soma.cognition.overwhelm + intensity * 10);
            soma.cognition.vulnerability = Math.min(100, soma.cognition.vulnerability + intensity * 15);
        }
        else if (emotionType === "tenderness") {
            soma.physiology.oxytocin = Math.min(100, soma.physiology.oxytocin + intensity * 20);
            soma.cognition.contentment = Math.min(100, soma.cognition.contentment + intensity * 15);
            soma.cognition.vulnerability = Math.min(100, soma.cognition.vulnerability + intensity * 10);
            soma.sensation.warmth = Math.min(100, soma.sensation.warmth + intensity * 10);
        }
        else if (emotionType === "fear") {
            soma.physiology.adrenaline = Math.min(100, soma.physiology.adrenaline + intensity * 20);
            soma.physiology.cortisol = Math.min(100, soma.physiology.cortisol + intensity * 18);
            soma.physiology.heartRate += intensity * 12;
            soma.cognition.focus = Math.max(30, soma.cognition.focus + intensity * 15);
            if (soma.sensation.arousal > 40) {
                soma.sensation.arousal = Math.min(100, soma.sensation.arousal + intensity * 8);
            }
        }
    }
}
exports.StimulusProcessor = StimulusProcessor;
class ActionParser {
    static parse(text) {
        const stimuli = [];
        const textLower = text.toLowerCase();
        if (/\b(touch|stroke|caress|run.*hand|trail|trace|glide)/i.test(textLower)) {
            const zone = ActionParser.findZone(textLower);
            const quality = ActionParser.determineQuality(textLower);
            const intensity = ActionParser.determineIntensity(textLower, 45);
            stimuli.push(new Stimulus({ type: "touch", intensity, zone, quality }));
        }
        if (/\b(kiss|kisses|kissing)/i.test(textLower)) {
            const zone = ActionParser.findZone(textLower) ?? BodyZone.LIPS;
            const quality = ActionParser.determineQuality(textLower);
            const intensity = ActionParser.determineIntensity(textLower, 50);
            stimuli.push(new Stimulus({ type: "touch", intensity, zone, quality }));
        }
        if (/\b(grip|grab|squeeze|pull|press|push)/i.test(textLower)) {
            const zone = ActionParser.findZone(textLower);
            const quality = /hard|tight|firm/i.test(textLower) ? "rough" : "neutral";
            const intensity = ActionParser.determineIntensity(textLower, 65);
            stimuli.push(new Stimulus({ type: "pressure", intensity, zone, quality }));
        }
        if (/\b(spank|slap|smack|hit|bite|pinch|scratch)/i.test(textLower)) {
            const zone = ActionParser.findZone(textLower);
            const intensity = ActionParser.determineIntensity(textLower, 70);
            stimuli.push(new Stimulus({ type: "pain", intensity, zone }));
        }
        if (/\b(penetrat|enter|push.*in|slide.*in|thrust|fuck|fill)/i.test(textLower)) {
            const zone = BodyZone.GENITALS;
            const quality = /deep|all.*way|fully|hilt/i.test(textLower) ? "deep" : "shallow";
            const intensity = ActionParser.determineIntensity(textLower, 75);
            stimuli.push(new Stimulus({ type: "penetration", intensity, zone, quality }));
        }
        if (/\b(edge|edging|close|almost|don't.*cum|hold.*back|stop.*before)/i.test(textLower)) {
            stimuli.push(new Stimulus({ type: "edge", intensity: 80 }));
        }
        if (/\b(cum|orgasm|climax|release|finish|let.*go)/i.test(textLower)) {
            stimuli.push(new Stimulus({ type: "release", intensity: 100 }));
        }
        if (/\b(good|perfect|beautiful|gorgeous)/i.test(textLower)) {
            stimuli.push(new Stimulus({ type: "emotional", intensity: 60, quality: "praise" }));
        }
        if (/\b(slut|whore|dirty|filthy)/i.test(textLower) && !/\b(not|don't)/i.test(textLower)) {
            stimuli.push(new Stimulus({ type: "emotional", intensity: 55, quality: "degradation" }));
        }
        if (/\b(tender|gentle|soft|sweet|care)/i.test(textLower)) {
            stimuli.push(new Stimulus({ type: "emotional", intensity: 50, quality: "tenderness" }));
        }
        return stimuli;
    }
    static findZone(text) {
        for (const [zone, pattern] of ActionParser.zonePatterns) {
            if (pattern.test(text))
                return zone;
        }
        return undefined;
    }
    static determineQuality(text) {
        if (/teas|light|barely|feather|trace/i.test(text))
            return "teasing";
        if (/gentle|soft|tender|slow/i.test(text))
            return "gentle";
        if (/rough|hard|firm|force/i.test(text))
            return "rough";
        return "neutral";
    }
    static determineIntensity(text, base) {
        if (/brutal|relentless|merciless|savage|violent/i.test(text)) {
            return Math.min(100, base + 35);
        }
        if (/hard|rough|firm|intense|forceful/i.test(text)) {
            return Math.min(100, base + 20);
        }
        if (/gentle|soft|tender|light/i.test(text)) {
            return Math.max(20, base - 20);
        }
        if (/barely|feather|ghost/i.test(text)) {
            return Math.max(10, base - 30);
        }
        return base;
    }
}
exports.ActionParser = ActionParser;
ActionParser.zonePatterns = [
    [BodyZone.NECK, /neck|throat/i],
    [BodyZone.SHOULDERS, /shoulder/i],
    [BodyZone.CHEST, /chest|torso/i],
    [BodyZone.STOMACH, /stomach|belly|abdomen|tummy/i],
    [BodyZone.LOWER_BACK, /lower back/i],
    [BodyZone.UPPER_BACK, /upper back|back/i],
    [BodyZone.ARMS, /\barm/i],
    [BodyZone.HANDS, /hand|wrist|finger/i],
    [BodyZone.LEGS, /\bleg|thigh(?!s\s*apart)/i],
    [BodyZone.FEET, /feet|foot|ankle/i],
    [BodyZone.INNER_THIGHS, /inner thigh|between.*thigh/i],
    [BodyZone.HIPS, /\bhip|waist/i],
    [BodyZone.PELVIS, /pelvis|groin|thighs\s*apart/i],
    [BodyZone.GENITALS, /genital|between.*legs|intimate|cock|pussy|clit/i],
    [BodyZone.EARS, /\bear/i],
    [BodyZone.FACE, /face|cheek|jaw/i],
    [BodyZone.LIPS, /\blip/i],
    [BodyZone.SCALP, /scalp|head(?!ing)/i],
    [BodyZone.HAIR, /hair/i],
];
const ACTIVE_BODIES = new Map();
function getSoma(userId) {
    if (!ACTIVE_BODIES.has(userId)) {
        ACTIVE_BODIES.set(userId, new SOMA(userId));
    }
    else {
        ACTIVE_BODIES.get(userId).update();
    }
    return ACTIVE_BODIES.get(userId);
}
function resetSoma(userId) {
    const soma = new SOMA(userId);
    ACTIVE_BODIES.set(userId, soma);
    return soma;
}
