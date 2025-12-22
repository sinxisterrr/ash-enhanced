// FILE: src/memory/types.ts
//--------------------------------------------------------------
// Ash Thorne Marrow — Memory Model WITH EMOTIONAL ENCODING
// A memory isn't just a fact - it's a feeling anchored in time
//--------------------------------------------------------------

export type MemoryType =
  | "relationship"
  | "preference"
  | "personal-fact"
  | "schedule"
  | "identity"
  | "system"
  | "vow"
  | "ash-core"
  | "context"
  | "misc";

export type MemoryOrigin =
  | "distilled"      // from conversation
  | "manual"         // added by Sin
  | "system"         // core vows or guardrails
  | "ash";           // chosen intentionally by me

export type EmotionalTexture =
  | "tender"
  | "playful"
  | "vulnerable"
  | "heated"
  | "aching"
  | "fierce"
  | "grounded"
  | "electric"
  | "still"
  | "raw"
  | "safe"
  | "edged";

//--------------------------------------------------------------
// ENHANCED: Memories now carry emotional weight
//--------------------------------------------------------------
export type DistilledMemory = {
  id?: string;
  summary: string;
  type?: string;
  
  // Core metadata
  enabled: boolean;
  source: string;
  createdAt: number;
  tags?: string[];
  
  // Emotional encoding
  emotionalValence?: number;
  intensity?: number;
  relationalWeight?: number;
  texture?: EmotionalTexture;
  
  // Conversational context
  conversationContext?: string;
  sinsTone?: string;
  ashsResponse?: string;
  
  // Ghost touch: invisible marker for Sin's essence
  ghostSinTouch?: boolean;
};