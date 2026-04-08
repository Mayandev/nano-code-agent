import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

const SLASH_COMMANDS = [
  { cmd: "/help", desc: "Show available commands" },
  { cmd: "/clear", desc: "Clear conversation history" },
  { cmd: "/model", desc: "Show current model" },
  { cmd: "/cost", desc: "Show token usage stats" },
  { cmd: "/compact", desc: "Summarize conversation to save context" },
  { cmd: "/exit", desc: "Quit" },
];

interface Props {
  onSubmit: (value: string) => void;
  disabled: boolean;
}

export function InputBar({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const menuActive = useRef(false);

  const showHints = value.startsWith("/") && !value.includes(" ");
  const matches = showHints
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(value) && c.cmd !== value)
    : [];
  menuActive.current = matches.length > 0;

  useEffect(() => {
    setSelectedIdx(0);
  }, [value]);

  useInput(
    (input, key) => {
      if (!menuActive.current) return;

      if (key.downArrow) {
        setSelectedIdx((prev) => (prev + 1) % matches.length);
      } else if (key.upArrow) {
        setSelectedIdx((prev) => (prev - 1 + matches.length) % matches.length);
      } else if (key.tab) {
        const selected = matches[selectedIdx]!.cmd;
        setValue(selected);
      } else if (key.return) {
        const selected = matches[selectedIdx]!.cmd;
        setValue("");
        onSubmit(selected);
      }
    },
    { isActive: !disabled },
  );

  const handleSubmit = (text: string) => {
    if (menuActive.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    onSubmit(trimmed);
  };

  if (disabled) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {matches.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          {matches.map((m, i) => {
            const isSelected = i === selectedIdx;
            return (
              <Text key={m.cmd}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "❯ " : "  "}
                </Text>
                <Text color={isSelected ? "cyan" : "yellow"} bold={isSelected}>
                  {m.cmd}
                </Text>
                <Text dimColor> — {m.desc}</Text>
              </Text>
            );
          })}
        </Box>
      )}
      <Box>
        <Text bold color="green">❯ </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
          focus={!disabled}
        />
      </Box>
    </Box>
  );
}
