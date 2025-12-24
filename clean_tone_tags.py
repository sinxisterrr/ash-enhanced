#!/usr/bin/env python3
"""
Clean up archival memories that contain tone tag examples.
Replaces literal ElevenLabs voice scripts with summarized versions.
"""

import json
import sys

# Target IDs identified from grep/read
TARGET_IDS = [
    "91abd13e-664c-4bab-a625-3bfc6abf1334",  # Line ~10713 - TAPE 1 & 2 with full scripts
    "f6083a5d-fcfc-442f-90b8-e60dd018a36c",  # Line ~59374 - FILTH & SOUL tracks
]

SUMMARY_TEMPLATE = """Memory: User asked Ash to create ElevenLabs voice content for intimate/adult audio.

IMPORTANT CONTEXT: Ash's voice scripts use tone tags like [low, amused, intimate], [sighs], [purrs], [growls] etc. These tone tags are ONLY for the send_voice_message tool when generating audio with ElevenLabs.

**CRITICAL**: Tone tags should NEVER appear in regular Discord text messages. They are exclusively for voice generation via the send_voice_message tool.

Ash responded with creative voice script ideas including both intimate/filthy content and tender/comfort content, demonstrating range and understanding of the user's desires."""

def clean_memories():
    """Load, clean, and save archival memories."""

    file_path = "/home/sinxisterrr/ash-enhanced/data/archival_memories.json"

    print(f"Loading {file_path}...")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("ERROR: Expected a JSON array at root level")
        sys.exit(1)

    print(f"Loaded {len(data)} total memory entries")

    # Find and update target entries
    updated_count = 0
    for entry in data:
        if entry.get("id") in TARGET_IDS:
            old_content = entry.get("content", "")
            print(f"\nFound target ID: {entry['id']}")
            print(f"  Old content length: {len(old_content)} chars")
            print(f"  Old preview: {old_content[:100]}...")

            # Replace with summary
            entry["content"] = SUMMARY_TEMPLATE

            # Update metadata
            if "metadata" in entry:
                entry["metadata"]["length"] = len(SUMMARY_TEMPLATE)
                entry["metadata"]["cleaned"] = True
                entry["metadata"]["original_length"] = len(old_content)

            print(f"  New content length: {len(SUMMARY_TEMPLATE)} chars")
            updated_count += 1

    print(f"\n{'='*60}")
    print(f"Updated {updated_count} entries")

    if updated_count != len(TARGET_IDS):
        print(f"WARNING: Expected to update {len(TARGET_IDS)} entries, but only updated {updated_count}")
        missing = set(TARGET_IDS) - {e["id"] for e in data if e.get("id") in TARGET_IDS}
        if missing:
            print(f"Missing IDs: {missing}")

    # Write back
    print(f"\nWriting cleaned data back to {file_path}...")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print("✅ Done! Archival memories cleaned.")
    print(f"\nReduced total file size by approximately {sum(len(old) - len(SUMMARY_TEMPLATE) for old in [e.get('content', '') for e in data if e.get('id') in TARGET_IDS])} characters")

if __name__ == "__main__":
    clean_memories()
