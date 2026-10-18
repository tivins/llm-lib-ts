import {
  ChatCompletionChunk,
  ChatCompletionOptions,
  Conversation,
  LLM,
  Message,
  Role,
  Tool,
  ToolRegistry,
  ToolSchema,
} from "../src";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

const PROVIDER_URL = process.env.PROVIDER_URL ?? "http://127.0.0.1:8080";
const API_KEY = process.env.API_KEY ?? undefined;
const LLM_MODEL = process.env.LLM_MODEL ?? undefined;
const MAX_TOOL_ROUNDS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Palette / helpers d'affichage (même langage visuel que streamExample.ts)
// ─────────────────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";

const ACCENT = "\x1b[38;5;208m";
const CYAN = "\x1b[38;5;39m";
const REASONING = "\x1b[38;5;245m" + ITALIC;
const ANSWER = "\x1b[38;5;253m";
const TOOL = "\x1b[38;5;177m"; // violet doux → outils
const SUCCESS = "\x1b[38;5;114m";
const ERROR = "\x1b[38;5;203m";

const paint = (color: string, s: string) => `${color}${s}${RESET}`;
const dim = (s: string) => `${DIM}${s}${RESET}`;

const GUTTER = " \x1b[38;5;240m┃\x1b[0m ";
const GUTTER_EMPTY = " \x1b[38;5;240m┃\x1b[0m";

const write = (s: string) => process.stdout.write(s);
const line = (s = "") => write(s === "" ? `${GUTTER_EMPTY}\n` : `${GUTTER}${s}\n`);

const contentWidth = () => Math.min(96, Math.max(40, (process.stdout.columns ?? 80) - 4));

class GutterWriter {
  private col = 0;
  private word = "";

  constructor(private readonly style: string, private readonly width = contentWidth()) {}

  begin(): void {
    write(GUTTER + this.style);
  }

  write(text: string): void {
    for (const ch of text.replace(/\r/g, "")) {
      if (ch === "\n") {
        this.flushWord();
        this.newline();
        continue;
      }
      this.word += ch;
      if (ch === " ") this.flushWord();
    }
  }

  end(): void {
    this.flushWord();
    write(RESET + "\n");
  }

  private newline(): void {
    write(RESET + "\n" + GUTTER + this.style);
    this.col = 0;
  }

  private flushWord(): void {
    if (this.word === "") return;
    const word = this.word;
    this.word = "";

    if (this.col > 0 && this.col + word.length > this.width) {
      this.newline();
      const trimmed = word.replace(/^ +/, "");
      write(trimmed);
      this.col += trimmed.length;
    } else {
      write(word);
      this.col += word.length;
    }
  }
}

class Spinner {
  private readonly frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private i = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly label: string) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const frame = this.frames[this.i++ % this.frames.length];
      write(`\r${GUTTER}${ACCENT}${frame}${RESET} ${dim(this.label)}`);
    }, 80);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    write("\r\x1b[K");
  }
}

function sectionTitle(title: string, color: string): void {
  line();
  line(`${color}${BOLD}▌ ${title}${RESET}`);
  line();
}

function banner(endpoint: string, contextSize: number | null, toolNames: string[]): void {
  line();
  line(`${ACCENT}${BOLD}▌ llm stream + tool${RESET}${dim(" — chat interactif")}`);
  line(`${dim("endpoint")}  ${endpoint}`);
  if (contextSize !== null) {
    line(`${dim("contexte")}  ${contextSize.toLocaleString("fr-FR")} tokens`);
  }
  line(`${dim("outils")}    ${toolNames.map((n) => paint(TOOL, n)).join(dim(", "))}`);
  line(dim("Entrée vide pour quitter · Ctrl-C pendant la génération pour l'interrompre"));
  line(dim('Astuce : demande « quelle heure est-il ? » pour forcer l\'appel à get_time'));
  line();
}

function footer(
  result: {
    duration: number | null;
    usage: {promptTokens: number; completionTokens: number; totalTokens: number};
  },
  aborted: boolean,
  toolRounds: number,
): void {
  const ms = result.duration ?? 0;
  const duration = ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`;
  const seconds = ms / 1000;
  const u = result.usage;

  const parts = [
    aborted ? paint(ERROR, "interrompu") : paint(SUCCESS, "terminé"),
    paint(ACCENT, duration),
  ];
  if (toolRounds > 0) {
    parts.push(`${paint(TOOL, String(toolRounds))} round${toolRounds > 1 ? "s" : ""} outil`);
  }
  if (u.totalTokens > 0) {
    parts.push(
      `${paint(ACCENT, u.totalTokens.toString())} tokens ${dim(`(${u.promptTokens} + ${u.completionTokens})`)}`,
    );
    if (seconds > 0 && u.completionTokens > 0) {
      parts.push(paint(ACCENT, `${Math.round(u.completionTokens / seconds)} tok/s`));
    }
  }

  line();
  line(parts.join(dim("  ·  ")));
  line();
}

/** Affiche le flux : raisonnement, réponse, et fragments d'appel d'outil. */
class StreamRenderer {
  private phase: "idle" | "reasoning" | "answer" | "tool" = "idle";
  private reasoning: GutterWriter | null = null;
  private answer: GutterWriter | null = null;
  private tool: GutterWriter | null = null;
  private text = "";

  constructor(private readonly spinner: Spinner) {}

  readonly onChunk = (chunk: ChatCompletionChunk): void => {
    if (chunk.reasoningDelta) {
      this.enter("reasoning");
      this.reasoning!.write(chunk.reasoningDelta);
    }
    if (chunk.delta) {
      this.enter("answer");
      this.text += chunk.delta;
      this.answer!.write(chunk.delta);
    }
    if (chunk.toolCallDeltas) {
      this.enter("tool");
      for (const delta of chunk.toolCallDeltas) {
        if (delta.name) this.tool!.write(`${delta.name}(`);
        if (delta.argumentsJson) this.tool!.write(delta.argumentsJson);
      }
    }
  };

  get answerText(): string {
    return this.text;
  }

  get untouched(): boolean {
    return this.phase === "idle";
  }

  finish(): void {
    this.spinner.stop();
    if (this.phase === "answer") this.answer!.end();
    else if (this.phase === "reasoning") this.reasoning!.end();
    else if (this.phase === "tool") {
      this.tool!.write(")");
      this.tool!.end();
    }
  }

  private enter(phase: "reasoning" | "answer" | "tool"): void {
    if (this.phase === phase) return;
    this.spinner.stop();

    if (this.phase === "answer") this.answer?.end();
    else if (this.phase === "reasoning") this.reasoning?.end();
    else if (this.phase === "tool") this.tool?.end();

    if (phase === "reasoning") {
      sectionTitle("raisonnement", CYAN);
      this.reasoning = new GutterWriter(REASONING);
      this.reasoning.begin();
    } else if (phase === "answer") {
      sectionTitle("réponse", ACCENT);
      this.answer = new GutterWriter(ANSWER);
      this.answer.begin();
    } else {
      sectionTitle("appel d'outil", TOOL);
      this.tool = new GutterWriter(TOOL);
      this.tool.begin();
    }
    this.phase = phase;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Outil simple : heure courante (côté client)
// ─────────────────────────────────────────────────────────────────────────────

const tools = new ToolRegistry(
  new Tool(
    new ToolSchema(
      "get_time",
      "Return the current date and time. Call this whenever the user asks what time it is or needs the current date.",
      {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: 'IANA timezone, e.g. "Europe/Paris". Defaults to the host local zone.',
          },
        },
        additionalProperties: false,
      },
    ),
    async (argsJson: string) => {
      let timezone: string | undefined;
      try {
        const args = JSON.parse(argsJson || "{}") as {timezone?: string};
        timezone = args.timezone?.trim() || undefined;
      } catch {
        return JSON.stringify({error: "Invalid JSON arguments"});
      }

      const now = new Date();
      const formatOpts: Intl.DateTimeFormatOptions = {
        dateStyle: "full",
        timeStyle: "long",
        ...(timezone ? {timeZone: timezone} : {}),
      };

      try {
        return JSON.stringify({
          iso: now.toISOString(),
          local: now.toLocaleString("fr-FR", formatOpts),
          timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          unix_ms: now.getTime(),
        });
      } catch (e) {
        return JSON.stringify({
          error: e instanceof Error ? e.message : String(e),
          hint: 'Use a valid IANA timezone like "Europe/Paris" or "UTC".',
        });
      }
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// Programme
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM =
  "Tu es un assistant utile. Quand l'utilisateur demande l'heure ou la date, " +
  "appelle l'outil get_time avant de répondre. Réponds en français, de façon concise.";

const llm = new LLM(PROVIDER_URL, API_KEY, LLM_MODEL, 300);
const contextSize = await llm.contextSize().catch(() => null);

const rl = readline.createInterface({input, output});

let abortController: AbortController | null = null;
process.on("SIGINT", () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
    return;
  }
  write("\n");
  line(dim("au revoir 👋"));
  rl.close();
  process.exit(0);
});

async function ask(prompt: string): Promise<string | null> {
  try {
    return await rl.question(prompt);
  } catch {
    return null;
  }
}

banner(llm.endpoint, contextSize, tools.all().map((t) => t.name));

const systemAnswer = await ask(
  `${GUTTER}${dim("system prompt")} ${dim(`— Entrée pour le défaut`)}\n${GUTTER}${ACCENT}❯ ${RESET}`,
);
const systemPrompt = (systemAnswer ?? "").trim() || DEFAULT_SYSTEM;
const conv = new Conversation([new Message(Role.System, systemPrompt)]);

while (true) {
  line();
  const userMessage = await ask(`${GUTTER}${ACCENT}❯ ${RESET}`);
  if (userMessage === null || userMessage.trim() === "") {
    line(dim("au revoir 👋"));
    break;
  }
  conv.addMessage(new Message(Role.User, userMessage));

  abortController = new AbortController();
  const options = new ChatCompletionOptions({ temperature: 0.2, topP: 0.9, tools, toolChoice: "auto" });
  options.signal = abortController.signal;

  let toolRounds = 0;
  let lastResult: Awaited<ReturnType<LLM["chatCompletionStream"]>> | null = null;
  let aborted = false;

  try {
    while (true) {
      const spinner = new Spinner(
        toolRounds === 0 ? "génération en cours…" : `génération (après outil #${toolRounds})…`,
      );
      spinner.start();
      const renderer = new StreamRenderer(spinner);

      const result = await llm.chatCompletionStream(conv, options, renderer.onChunk);
      renderer.finish();
      lastResult = result;
      aborted = result.finishReason() === "aborted";

      if (aborted) {
        if (renderer.untouched) {
          line();
          line(paint(ERROR, "génération interrompue avant toute réponse"));
        }
        break;
      }

      if (!result.hasToolCalls()) {
        const stored = result.toStoredMessage();
        if (stored) {
          conv.addMessage(stored);
        } else if (renderer.untouched) {
          line();
          line(paint(ERROR, "aucune réponse reçue"));
        }
        break;
      }

      if (toolRounds >= MAX_TOOL_ROUNDS) {
        line();
        line(paint(ERROR, `limite de ${MAX_TOOL_ROUNDS} rounds d'outils atteinte`));
        break;
      }

      const assistant = result.assistantMessage();
      if (!assistant?.toolCalls?.length) {
        line();
        line(paint(ERROR, "tool_calls annoncés mais message assistant manquant"));
        break;
      }

      conv.addMessage(result.toStoredMessage() ?? assistant);

      for (const call of assistant.toolCalls) {
        sectionTitle(`outil → ${call.name}`, TOOL);
        line(dim("args") + "  " + paint(TOOL, call.argumentsJson || "{}"));

        const toolMessage = await tools.execute(call);
        conv.addMessage(toolMessage);

        line(dim("résultat"));
        const resultWriter = new GutterWriter(SUCCESS);
        resultWriter.begin();
        resultWriter.write(toolMessage.content);
        resultWriter.end();
      }

      toolRounds++;
    }

    if (lastResult) {
      footer(lastResult, aborted, toolRounds);
    }
  } catch (e) {
    line();
    line(`${ERROR}✖ erreur${RESET}  ${e instanceof Error ? e.message : String(e)}`);
    line();
  } finally {
    abortController = null;
  }
}

rl.close();
