import React from "react";
import { render, Text, Box } from "ink";
import { App } from "./components/App.js";
import { loadConfig } from "./config.js";
import { runHeadless, readStdin } from "./headless.js";

const config = loadConfig();

if (!config.apiKey) {
  console.error("Error: OPENAI_API_KEY is not set.");
  console.error("Set environment variables:");
  console.error('  export OPENAI_API_KEY="sk-..."');
  console.error('  export OPENAI_BASE_URL="https://api.openai.com/v1"  (optional)');
  console.error('  export CLAUDE_NANO_MODEL="gpt-4o"  (optional)');
  process.exit(1);
} else {
  const headlessPrompt = config.prompt ?? (await readStdin());

  if (headlessPrompt) {
    const headlessConfig = { ...config, autoApprove: true, permissionMode: config.permissionMode === "default" ? "auto" as const : config.permissionMode };
    const result = await runHeadless(headlessConfig, headlessPrompt);
    if (config.jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.success ? 0 : 1);
  } else {
    render(<App config={config} />);
  }
}
