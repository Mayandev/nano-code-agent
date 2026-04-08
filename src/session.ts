import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { ChatMessage } from "./types.js";

export interface SessionMeta {
  id: string;
  cwd: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summary: string;
}

interface SessionData {
  meta: SessionMeta;
  messages: ChatMessage[];
}

const SESSIONS_DIR = path.join(os.homedir(), ".claude-nano", "sessions");

function ensureDir() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function summarizeFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser && typeof firstUser.content === "string") {
    const text = firstUser.content.slice(0, 80);
    return text.length < firstUser.content.length ? text + "..." : text;
  }
  return "(empty session)";
}

export function createSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${ts}-${rand}`;
}

export function saveSession(
  id: string,
  messages: ChatMessage[],
  model: string,
  createdAt?: string,
): void {
  ensureDir();
  const now = new Date().toISOString();
  const data: SessionData = {
    meta: {
      id,
      cwd: process.cwd(),
      model,
      createdAt: createdAt ?? now,
      updatedAt: now,
      messageCount: messages.length,
      summary: summarizeFromMessages(messages),
    },
    messages,
  };
  fs.writeFileSync(sessionPath(id), JSON.stringify(data, null, 2), "utf-8");
}

export function loadSession(id: string): SessionData | null {
  try {
    const raw = fs.readFileSync(sessionPath(id), "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function listSessions(): SessionMeta[] {
  ensureDir();
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const sessions: SessionMeta[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as SessionData;
      sessions.push(data.meta);
    } catch {
      // skip corrupted files
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLastSessionId(): string | null {
  const sessions = listSessions();
  return sessions.length > 0 ? sessions[0]!.id : null;
}
