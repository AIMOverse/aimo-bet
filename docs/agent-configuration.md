# Agent Configuration Implementation

This document describes the custom agent configuration system implemented in aimo-chat.

## Overview

Users can configure a **custom agent** that combines:
- **Model** - Which LLM to use
- **Tools** - What capabilities it has
- **System Prompt** - Instructions/personality
- **Settings** - Loop control parameters (maxSteps, temperature)

The custom agent is stored in localStorage and can be selected alongside preset agents from the AiMo Network registry.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Sources                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐         ┌─────────────────────────┐   │
│  │  Preset Agents  │         │    Custom Agent         │   │
│  │  (from AiMo     │         │    (localStorage)       │   │
│  │   Network)      │         │                         │   │
│  └────────┬────────┘         └───────────┬─────────────┘   │
│           │                              │                  │
│           └──────────┬───────────────────┘                  │
│                      ▼                                      │
│           ┌─────────────────────┐                          │
│           │  Agent Selector     │                          │
│           │  (in Chat Header)   │                          │
│           └─────────────────────┘                          │
│                                                             │
│  Future: aimo-node backend replaces localStorage            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Schema

### CustomAgentConfig

Aligned with the [AI SDK Agent class](https://sdk.vercel.ai/docs/agents):

```typescript
interface CustomAgentConfig {
  id: string;                    // Local UUID ("custom-agent")
  name: string;                  // Display name
  description?: string;          // Optional description

  // Core AI SDK Agent properties
  modelId: string;               // e.g., "openai/gpt-4o"
  tools: string[];               // Tool IDs to enable
  systemPrompt?: string;         // System instruction

  // Agent settings
  settings?: {
    maxSteps?: number;           // stopWhen: stepCountIs(n), default: 10
    temperature?: number;        // Model temperature (0-2), default: 0.7
  };

  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

### AgentState (Zustand Store)

```typescript
interface AgentState {
  // Selection state
  selectedAgentId: string | null;
  selectedAgentSource: 'preset' | 'custom' | null;

  // Custom agent (single, stored in localStorage)
  customAgent: CustomAgentConfig;

  // Actions
  setSelectedAgent: (id: string | null, source: 'preset' | 'custom' | null) => void;
  selectCustomAgent: () => void;
  setCustomAgent: (config: CustomAgentConfig) => void;
  updateCustomAgent: (updates: Partial<CustomAgentConfig>) => void;
  resetCustomAgent: () => void;
  clearSelection: () => void;

  // Helpers
  isCustomAgentSelected: () => boolean;
  isCustomAgentConfigured: () => boolean;
}
```

## Files

### Types
| File | Description |
|------|-------------|
| `types/agents.ts` | CustomAgentConfig, CustomAgentSettings, AgentSource types |

### Store
| File | Description |
|------|-------------|
| `store/agentStore.ts` | Zustand store with localStorage persistence |

### Pages
| File | Description |
|------|-------------|
| `app/agent/page.tsx` | Agent configuration page |

### Components
| File | Description |
|------|-------------|
| `components/agent/AgentConfigForm.tsx` | Main configuration form |
| `components/agent/AgentModelSelector.tsx` | Model dropdown (controlled) |
| `components/agent/AgentToolSelector.tsx` | Tool multi-select with checkboxes |
| `components/agent/index.ts` | Barrel export |
| `components/chat/ChatAgentSelector.tsx` | Updated dropdown with "My Agent" option |

## User Flow

### Configuring an Agent

1. User navigates to `/agent` page
2. User fills in:
   - Name and description
   - Selects a model from dropdown
   - Checks tools to enable
   - Writes system prompt
   - Optionally adjusts advanced settings
3. User clicks "Save"
4. Configuration is persisted to localStorage

### Selecting an Agent in Chat

1. User clicks the agent selector in chat header
2. Dropdown shows:
   - "No Agent" option (use model directly)
   - "My Agent" section with custom agent
   - "Configure agent" link to `/agent`
   - "Preset Agents" section with registry agents
3. Custom agent is disabled if not configured (no model selected)
4. Selection is persisted to localStorage

## Component Details

### AgentConfigForm

The main form component with sections:

| Section | Components | Description |
|---------|------------|-------------|
| Header | Title, Save/Reset buttons | Page actions |
| Basic Info | Input, Textarea | Name and description |
| Model | AgentModelSelector | LLM selection |
| Tools | AgentToolSelector | Multi-select with checkboxes |
| System Prompt | Textarea | Agent instructions |
| Advanced | Collapsible with inputs | maxSteps, temperature |

### AgentModelSelector

Controlled model selector that:
- Uses existing ModelSelector components
- Accepts `value` and `onChange` props
- Shows model name and description

### AgentToolSelector

Controlled tool multi-select that:
- Groups tools by source (built-in, network)
- Shows tool count badges
- Has "Select all" / "Clear all" actions
- Shows pricing for network tools
- Uses checkboxes instead of dropdown

### ChatAgentSelector

Updated dropdown that:
- Shows "My Agent" section at top
- Links to configure page
- Disables custom agent if not configured
- Shows preset agents from registry
- Tracks selection source (preset vs custom)

## localStorage Keys

| Key | Description |
|-----|-------------|
| `aimo-chat-agent` | Agent store state (selection + custom agent config) |

## Future Enhancements

1. **Multiple Custom Agents** - Allow creating and managing multiple custom agents
2. **Agent Import/Export** - Share agent configurations as JSON
3. **aimo-node Integration** - Persist agents to backend instead of localStorage
4. **Chat API Integration** - Use custom agent config in actual chat (AI SDK Agent class)
5. **Agent Templates** - Pre-built agent configurations for common use cases
