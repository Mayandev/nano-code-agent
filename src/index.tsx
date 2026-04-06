import React from "react";
import { render, Text, Box } from "ink";
import { App } from "./components/App.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

if (!config.apiKey) {
  render(
    <Box flexDirection="column" padding={1}>
      <Text bold color="red">Error: OPENAI_API_KEY is not set.</Text>
      <Text dimColor>
        Set environment variables to get started:
      </Text>
      <Text>  export OPENAI_API_KEY=&quot;sk-...&quot;</Text>
      <Text>  export OPENAI_BASE_URL=&quot;https://api.openai.com/v1&quot;  (optional)</Text>
      <Text>  export CLAUDE_NANO_MODEL=&quot;gpt-4o&quot;  (optional)</Text>
    </Box>,
  );
} else {
  render(<App config={config} />);
}
