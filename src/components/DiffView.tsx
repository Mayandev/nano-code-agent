import React from "react";
import { Box, Text } from "ink";

interface Props {
  patch: string;
}

export function DiffView({ patch }: Props) {
  const lines = patch.split("\n");

  return (
    <Box flexDirection="column" marginLeft={2}>
      {lines.map((line, i) => (
        <DiffLine key={i} line={line} />
      ))}
    </Box>
  );
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("@@")) {
    return <Text color="cyan">{line}</Text>;
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return <Text color="green">{line}</Text>;
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return <Text color="red">{line}</Text>;
  }
  if (line.startsWith("---") || line.startsWith("+++")) {
    return <Text bold dimColor>{line}</Text>;
  }
  return <Text dimColor>{line}</Text>;
}
