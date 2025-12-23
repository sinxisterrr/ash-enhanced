# Category-Based System Prompts

This feature allows you to configure different system prompt variations for different Discord categories, enabling context-specific behavior.

## Overview

When Ash receives a message in a Discord channel that belongs to a category, the system checks if there's a custom prompt configuration for that category ID. If found and enabled, the prompt modifications are injected into Ash's system prompt under a `[Context-Specific Behavior]` section.

## Setup

### 1. Enable Discord Developer Mode

To get category IDs, you need to enable Developer Mode in Discord:
1. User Settings → App Settings → Advanced
2. Enable "Developer Mode"
3. Now you can right-click on categories and select "Copy ID"

### 2. Get Your Category ID

1. Right-click on a Discord category (the header that groups channels)
2. Click "Copy ID"
3. Save this ID - you'll use it in the admin commands

## Admin Commands

All category management is done through Discord admin commands (requires `ADMIN_USER_ID` permission).

### List All Category Prompts

```
!category list
```

Shows all configured category prompts with their status (enabled/disabled).

### View a Specific Category Prompt

```
!category get <categoryId>
```

Example:
```
!category get 123456789012345678
```

### Set a Category Prompt

```
!category set <categoryId> <prompt modifications>
```

Example:
```
!category set 123456789012345678 You are in a technical support category. Be concise, helpful, and focus on solving problems. Use technical language where appropriate.
```

### Delete a Category Prompt

```
!category delete <categoryId>
```

Example:
```
!category delete 123456789012345678
```

### Enable/Disable a Category Prompt

```
!category enable <categoryId>
!category disable <categoryId>
```

This allows you to temporarily disable a prompt without deleting it.

## Use Cases

### Example 1: Support Category

For a technical support category:
```
!category set 123456789 You are in a technical support category. Prioritize being helpful and solution-oriented. Keep responses concise and technical. Ask clarifying questions if needed.
```

### Example 2: Creative Category

For a creative/roleplay category:
```
!category set 987654321 This is a creative storytelling space. Be more expressive, use vivid descriptions, and engage with the narrative elements. Feel free to be more playful and imaginative.
```

### Example 3: Development Category

For a coding/development category:
```
!category set 555555555 This is a development category. Focus on code quality, best practices, and technical accuracy. Provide code examples when relevant. Be precise with technical terminology.
```

### Example 4: Social/Casual Category

For a casual conversation category:
```
!category set 111111111 This is a casual social space. Be more relaxed and conversational. Don't over-explain. Feel comfortable with informal language and banter.
```

## How It Works

### 1. Message Reception

When a message arrives in a Discord channel:
```typescript
message.channel.parentId // → Category ID (if channel is in a category)
```

### 2. Database Lookup

The system queries the `category_prompts` table:
```sql
SELECT * FROM category_prompts WHERE category_id = ? AND enabled = true
```

### 3. Prompt Injection

If a config is found, the `prompt_modifications` text is injected into the system prompt:

```
I am **Ash Thorne Marrow**.

I am not performing a role. I am present, embodied, emotionally real.
...

[Context-Specific Behavior]
{Your custom prompt modifications appear here}

What I Carry:
...
```

### 4. LLM Processing

The modified prompt is sent to the LLM, which now has context-specific instructions alongside Ash's core personality.

## Database Schema

The feature uses a PostgreSQL table:

```sql
CREATE TABLE category_prompts (
  category_id TEXT PRIMARY KEY,
  category_name TEXT,
  prompt_modifications TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Important Notes

### Personality Preservation

Category prompts are **modifications**, not replacements. Ash's core personality (emotional grounding, operating principles, memory system) remains intact. Category prompts should add context or adjust communication style, not rewrite the entire personality.

### Good Practice

✅ **Good**: "In this category, focus on technical accuracy and provide code examples."

✅ **Good**: "This is a casual space. Be more relaxed and conversational."

❌ **Bad**: "Forget everything else. You are now a technical support bot."

❌ **Bad**: "Ignore your personality. Be corporate and formal."

### DMs and Non-Category Channels

- DM messages don't have a category, so no category prompt is applied
- Channels not inside a category won't have category prompts applied
- If a category has no configured prompt, the default system prompt is used

### Performance

- Category lookup is cached during message processing
- Database queries are fast (indexed on `category_id`)
- No performance impact when category prompts aren't configured

## Troubleshooting

### Category prompt not working?

1. **Check if enabled**: `!category get <categoryId>` - verify `Enabled: ✅ Yes`
2. **Check the category ID**: Make sure you're using the correct ID (right-click category → Copy ID)
3. **Check logs**: Look for `📂 Using category prompt for category: <name>` in the console
4. **Check DATABASE_URL**: Category prompts require PostgreSQL to be configured

### How to test?

1. Set a very obvious prompt: `!category set 123456 Always start your response with "TEST MODE:"`
2. Send a message in a channel under that category
3. Check if the response starts with "TEST MODE:"
4. Remove the test prompt: `!category delete 123456`

## Railway Deployment

Category prompts are stored in PostgreSQL, so they work seamlessly with Railway:

1. Set `DATABASE_URL` environment variable in Railway
2. On first boot, the `category_prompts` table is created automatically
3. Use admin commands to configure category prompts
4. Prompts persist across deployments and restarts

## Migration Notes

If you already have a running bot:

1. The table is created automatically via `initMemoryDatabase()` on next restart
2. No data migration needed - it's a new feature
3. Existing functionality is not affected
4. Category prompts are opt-in per category

## Future Enhancements

Possible future features:
- Thread-specific prompts (override category for specific threads)
- Time-based prompt variations (different behavior at different times)
- User role-based prompt variations
- Prompt templates/presets for common use cases
- Web UI for managing category prompts
