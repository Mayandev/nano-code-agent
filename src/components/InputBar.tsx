import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface Props {
  onSubmit: (value: string) => void;
  disabled: boolean;
}

export function InputBar({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    onSubmit(trimmed);
  };

  if (disabled) {
    return null;
  }

  return (
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
  );
}
