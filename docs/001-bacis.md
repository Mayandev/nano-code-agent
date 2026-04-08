Claude Code 上周因为 SourceMap 意外泄漏导致源码被逆向，GitHub 已经有了[源码](https://github.com/yasasbanukaofficial/claude-code)，总共有将近 50w 行的代码，网上也有很多的源码解析。本文主要通过实现一个简单的 Nano Code Agent，帮助理解类 Claude Code 的 CLI Code Agent 其的核心，主要的功能包括：

- 流式对话，逐字输出
	
- 读写文件、搜索代码、执行 Shell 命令
	
- ReAct 实现，LLM 自主决定调用哪些工具，多轮循环直到任务完成
	
- 危险操作需要用户手动确认
	
- 历史裁剪
	

## 技术栈以及架构

真正的核心依赖只有两个（OpenAI SDK 和 Ink），其余全部用 Node.js 原生能力实现。

- OpenAI SDK 负责和 LLM 对话
	
- [Ink](https://github.com/vadimdemedes/ink) 负责终端渲染，这也是 Claude Code Gemini CLI 等 Code Agent 选择的
	

![](0.png)

```Bash
./
├── agent.ts
├── components
│   ├── App.tsx
│   ├── InputBar.tsx
│   ├── MessageList.tsx
│   └── ToolCallView.tsx
├── config.ts
├── context.ts
├── index.tsx
├── llm.ts
├── permissions.ts
├── tools
│   ├── edit_file.ts
│   ├── index.ts
│   ├── list_dir.ts
│   ├── read_file.ts
│   ├── search.ts
│   ├── shell_exec.ts
│   └── write_file.ts
└── types.ts
```

整体架构如上图。Code Agent 通过与 LLM 进行通信，进行 Tool Calling，实现代码索索，写代码，执行命令等等。

```Bash
# Tool calling 的流程：
1. 你告诉 LLM："你有这些工具可以用"（JSON Schema 描述）
2. LLM 分析用户需求后，输出一个结构化的"我要调用 XX 工具，参数是 YY"
3. Agent 负责真正执行这个工具，把结果返回给 LLM
4. LLM 看到结果，决定是继续调工具还是给用户回复如此循环
```

这就是所谓的 **ReAct 循环**（Reasoning + Acting）。LLM 负责"Reasoning"，Agent代码负责"Acting"。

## 代码拆解

### LLM 客户端

整个 LLM 通信层只有短短的 34 行，主要处理 LLM 的流式对话响应，调用方可以用 `for await` 逐个处理 chunk，天然支持流式输出。

```TypeScript
export class LLMClient {
  private client: OpenAI;

  async *chat(
    messages: ChatMessage[],
    tools?: OpenAI.ChatCompletionTool[],
  ): AsyncGenerator<OpenAI.ChatCompletionChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
```

这里是用了 OpenAI 的 SDK，只要符合 OpenAI 标准的模型（例如火山引擎、deepseek），都可以直接使用而不用做额外的转换，代码看着比较简洁。

### 工具系统

#### 工具注册中心

ToolRegistry 做三件事：注册工具、把工具定义转成 OpenAI API 格式、执行工具。

```TypeScript
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  // 转成 OpenAI tools 参数格式，每次请求都传给 LLM
  toOpenAITools(): OpenAI.ChatCompletionTool[] {
    return this.list().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return `Error: unknown tool "${name}"`;
    return await tool.execute(args);
  }
}
```

`toOpenAITools()` 的返回值就是发给 LLM API 的 `tools` 参数。LLM 通过这些 JSON Schema 描述来"知道"自己有什么工具可用。

#### 6 个内置工具

Nano Code Agent 包括了六个基础的工具，每个工具的核心是 `execute` 函数，用于文件编辑以及命令执行。
**read\_file**— 读取文件并加行号：

```JavaScript
execute: async (args) => {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const numbered = lines
    .slice(start - 1, end)
    .map((line, i) => `${String(start + i).padStart(6)}|${line}`)
    .join("\n");
  return `File: ${filePath} (${lines.length} lines)\n${numbered}`;
}
```

**edit\_file**— 搜索替换，而非全文重写。主要是因为全文重写会消耗比较大的 token，而且容易丢失原文内容。精确的字符串替换更可靠：

```JavaScript
execute: async (args) => {
  const content = await fs.readFile(filePath, "utf-8");
  if (!content.includes(oldStr)) {
    return `Error: old_string not found. Make sure it matches exactly.`;
  }
  // 如果 old_string 有多个匹配，要求更精确的上下文
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences > 1 && !args.replace_all) {
    return `Error: old_string has ${occurrences} occurrences. Provide more context.`;
  }
  const updated = content.replace(oldStr, newStr);
  await fs.writeFile(filePath, updated, "utf-8");
}
```

**search**— 默认 ripgrep，更快，如果系统没有安装 ripgrep， 则 fallback 到grep

```JavaScript
execute: async (args) => {
  const useRg = await hasCommand("rg");
  const stdout = useRg
    ? await searchWithRg(pattern, dir, fileGlob, caseInsensitive)
    : await searchWithGrep(pattern, dir, fileGlob, caseInsensitive);
  // ...
}
```

**shell\_exec**— 带超时和输出截断的安全执行：

```Bash
execute: async (args) => {
  const { stdout, stderr } = await execAsync(command, {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  // 输出超过 20000 字符自动截断
}
```

另外还有 `write_file`（自动创建父目录）和 `list_dir`（带文件大小和排序），这里不一一列举了。

### Agent Loop

这是整个项目最核心的 100 行代码，以下面的对话为例子：

```Bash
用户说："帮我读取 package.json"
       ↓
  构建 messages: [system_prompt, user_message]
  调用 LLM（带 tools 列表）
       ↓
  LLM 返回: tool_calls: [{name: "read_file", arguments: {file_path: "package.json"}}]
       ↓
  执行 read_file → 得到文件内容
  追加到 messages: [..., tool_result]
  再次调用 LLM
       ↓
  LLM 返回: "这是 package.json 的内容：..."
  输出给用户，没有后续的 tools 需要调用了
```

核心是一个 `while (true)` 循环：

```TypeScript
async *run(userMessage: string): AsyncGenerator<AgentEvent> {
  this.messages.push({ role: "user", content: userMessage });

  while (true) {
    // 1. 裁剪历史，防止 token 超限
    this.messages = trimHistory(this.messages, this.config.maxContextTokens);

    // 2. 流式调用 LLM
    for await (const chunk of this.llm.chat(this.messages, tools)) {
      // 拼接文本 delta 和 tool_calls
    }

    // 3. 没有工具调用 → 回复完成，退出循环
    if (toolCalls.size === 0) {
      yield { type: "done" };
      return;
    }

    // 4. 有工具调用 → 逐个执行，结果追加到对话历史
    for (const tc of sortedCalls) {
      // 权限检查...
      const result = await this.registry.execute(tc.name, args);
      this.messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    // 回到 while 顶部，带着工具结果再次调用 LLM
  }
}
```

### Ink 终端 UI

使用 [Ink](https://github.com/vadimdemedes/ink) —— 一个"React for CLI"框架。支持通过用 JSX 写 CLI 终端界面，并且支持用 `useState`/`useEffect` 这种 React 函数进行管理状态。
https://github.com/vadimdemedes/ink

### App 主组件

核心状态管理：

```JavaScript
export function App({ config }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");  // 流式打字效果
  const [agent] = useState(() => new Agent(config));
  const [pendingConfirm, setPendingConfirm] = useState(null);  // 权限确认
```

消费 Agent 事件流：

```JavaScript
for await (const event of agent.run(text)) {
  switch (event.type) {
    case "text_delta":
      currentText += event.content;
      setStreamText(currentText);  // 实时更新流式文本
      break;
    case "tool_call_start":
      setMessages(prev => [...prev, { role: "tool_call", toolCall: event.toolCall }]);
      break;
    case "tool_result":
      // 更新对应工具调用的结果
      break;
  }
}
```

### 权限确认

Agent 的 `confirmHandler` 返回一个 Promise，UI 层通过 `setPendingConfirm` 挂起，用户按 `y/n` 后 resolve：

```TypeScript
// Agent 端
agent.setConfirmHandler((toolName, args) => {
  return new Promise<boolean>((resolve) => {
    setPendingConfirm({ toolName, args, resolve });  // 挂起等用户操作
  });
});

// UI 端
useInput((input, key) => {
  if (pendingConfirm) {
    if (input === "y") pendingConfirm.resolve(true);   // 批准
    if (input === "n") pendingConfirm.resolve(false);  // 拒绝
  }
});
```

这个模式把异步的用户交互优雅地桥接到了同步的 Agent 循环中。

## 上下文管理

LLM 有 token 上限。两个策略：

- 工具输出截断——超过 8000 字符时保留头尾，中间省略：
	

```TypeScript
export function truncateToolOutput(output: string, maxChars = 8000): string {
  if (output.length <= maxChars) return output;
  const head = output.slice(0, maxChars * 0.7);
  const tail = output.slice(-maxChars * 0.2);
  return `${head}\n\n... (${omitted} characters omitted) ...\n\n${tail}`;
}
```

- 历史裁剪——从最新消息往回保留，超出 token 限制时丢弃最早的消息：
	

```JavaScript
export function trimHistory(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  // 始终保留 system prompt
  // 从末尾向前累加，超出预算就停止
  for (let i = rest.length - 1; i >= 0; i--) {
    if (tokensUsed + msgTokens > maxTokens) break;
    keep.unshift(msg);
  }
}
```

## 演示

如果要运行项目，需要申请大模型的 API key，以火山引擎模型为例：

```Bash
# ARK_API_KEY=your-ark-api-key
# ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
# ARK_MODEL=ep-20240xxx-xxxxx
```

## 总结

回顾上面 Nano Code Agent 实现，Code Agent 的本质可以归结为一个 Loop：

```Bash
while (用户有需求) {
  1. 把「系统提示 + 对话历史 + 工具列表」发给 LLM
  2. LLM 返回文本 → 展示给用户
  3. LLM 返回工具调用 → 执行工具 → 结果追加到历史 → 回到 1
}
```

核心就是这个循环，剩下的都是工程：流式体验、权限控制、token 管理、终端 UI等等。但这只是最最最基础的一部分，如果更进一步，则需要做到沙箱隔离、Skills，Multi-Agent、联网检索等等功能，可以继续深入研究。

## Source Code

上面的代码放到了个人的 GitHub 仓库：
https://github.com/Mayandev/nano-code-agent