# User Manual

> The unified explanation for login, wallet, UCAN, and mobile-auth behavior has been moved to [User Login](./user-login-en.md). Read that first if you need the full authorization model.

This document focuses on daily product usage such as masks, chats, model settings, and history summary behavior. It does not repeat the full login background.

## Run & Port

Dev server runs on port `3020`:

```bash
npm run dev
```

Production:

```bash
npm run build
npm run start
```

## Masks

### What is a mask?

A mask is a reusable preset that combines:

- prompt context
- model settings
- conversation behavior settings

In practice, masks are used to create a more task-specific starting point for a chat.

### How do I add a built-in mask?

At the moment, built-in masks are still maintained in source code. Edit the files under `app/masks/` for the target language.

A practical workflow is:

1. Configure a mask in the app.
2. Export it as JSON from the mask editor.
3. Convert that JSON into the project TypeScript format.
4. Add it to the corresponding language file.

## Chat

### What do the buttons above the input box do?

- Chat settings: settings for the current chat only
- Theme switch: toggle auto / dark / light
- Quick commands: built-in prompt shortcuts; can also be searched by typing `/`
- All masks: open the mask list page
- Clear context: insert a clear marker so messages above it are excluded from the next model request
- Model settings: change the model for the current chat only

Changing the model here does not change the global default model.

### How do chat settings relate to global settings?

There are two entry points:

1. the global settings page
2. the in-chat settings panel

New chats start by following global settings. Once the user manually changes in-chat settings, that chat can diverge from the global defaults.

If the user enables the "use global settings" option again, the chat returns to following global configuration.

### What is included in a model request?

When the user sends a message, the request can include:

1. system-level prompt
2. history summary
3. mask prompts
4. recent chat messages
5. the current user input

## History Summary

History summary is the long-conversation compression mechanism.

When the conversation gets long enough, the app summarizes older unsummarized messages into a shorter summary. This keeps longer context at lower token cost, but it is a lossy compression step.

### When should I turn history summary off?

Turn it off for one-shot tasks where compression can hurt quality, such as:

- translation
- exact information extraction
- short independent prompts
