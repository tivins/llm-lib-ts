import {ChatCompletionChunk, ChatCompletionOptions, Conversation, LLM, Message, Role} from "../src";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";
import {appendFile, readFile} from "node:fs/promises";

// ─────────────────────────────────────────────────────────────────────────────
// Petite palette 256 couleurs + helpers de style
// ─────────────────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";

const ACCENT = "\x1b[38;5;208m"; // orange   → titres, valeurs, invite
const CYAN = "\x1b[38;5;39m";    // cyan     → titre du raisonnement
const REASONING = "\x1b[38;5;245m" + ITALIC; // gris italique → texte du raisonnement
const ANSWER = "\x1b[38;5;253m"; // blanc doux → texte de la réponse
const SUCCESS = "\x1b[38;5;114m"; // vert
const ERROR = "\x1b[38;5;203m";   // rouge

const paint = (color: string, s: string) => `${color}${s}${RESET}`;
const dim = (s: string) => `${DIM}${s}${RESET}`;

// Gouttière verticale à gauche de tout le contenu.
const GUTTER = " \x1b[38;5;240m┃\x1b[0m ";        // " ┃ " avec la barre en gris
const GUTTER_EMPTY = " \x1b[38;5;240m┃\x1b[0m";   // " ┃"  (ligne de respiration)

const write = (s: string) => process.stdout.write(s);
const line = (s = "") => write(s === "" ? `${GUTTER_EMPTY}\n` : `${GUTTER}${s}\n`);

/** Largeur utile pour le texte, recalculée à chaque génération (gère le redimensionnement). */
const contentWidth = () =>
    Math.min(96, Math.max(40, (process.stdout.columns ?? 80) - 4));

const reasoningSeparator = "\n\n---\n\n";
const systemPromptFormat = `[FORMAT_INSTRUCTION] : Tu dois impérativement répondre en respectant strictement la structure suivante :

\`\`\`
{résumé_concis_du_raisonnement}${reasoningSeparator}{ta_réponse_directe}
\`\`\`
`;

// ─────────────────────────────────────────────────────────────────────────────
// Écrivain « gouttière » : ré-indente chaque ligne et fait un retour à la ligne
// propre sur les mots, même quand le texte arrive morceau par morceau.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Spinner d'attente (avant l'arrivée du premier token)
// ─────────────────────────────────────────────────────────────────────────────

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
        write("\r\x1b[K"); // efface la ligne du spinner
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocs d'affichage
// ─────────────────────────────────────────────────────────────────────────────

function sectionTitle(title: string, color: string): void {
    line();
    line(`${color}${BOLD}▌ ${title}${RESET}`);
    line();
}

function banner(endpoint: string, contextSize: number | null): void {
    line();
    line(`${ACCENT}${BOLD}▌ llm stream${RESET}${dim(" — chat interactif")}`);
    line(`${dim("endpoint")}  ${endpoint}`);
    if (contextSize !== null) {
        line(`${dim("contexte")}  ${contextSize.toLocaleString("fr-FR")} tokens`);
    }
    line(dim("Entrée vide pour quitter · Ctrl-C pendant la génération pour l'interrompre"));
    line();
}

function footer(result: {duration: number | null; usage: {promptTokens: number; completionTokens: number; totalTokens: number}}, aborted: boolean): void {
    const ms = result.duration ?? 0;
    const duration = ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`;
    const seconds = ms / 1000;
    const u = result.usage;

    const parts = [
        aborted ? paint(ERROR, "interrompu") : paint(SUCCESS, "terminé"),
        paint(ACCENT, duration),
    ];
    if (u.totalTokens > 0) {
        parts.push(`${paint(ACCENT, u.totalTokens.toString())} tokens ${dim(`(${u.promptTokens} + ${u.completionTokens})`)}`);
        if (seconds > 0 && u.completionTokens > 0) {
            parts.push(paint(ACCENT, `${Math.round(u.completionTokens / seconds)} tok/s`));
        }
    }

    line();
    line(parts.join(dim("  ·  ")));
    line();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu d'un flux : bascule entre « raisonnement » et « réponse », coupe le
// spinner à l'arrivée du premier token et referme proprement le bloc courant.
// ─────────────────────────────────────────────────────────────────────────────

class StreamRenderer {
    private phase: "idle" | "reasoning" | "answer" = "idle";
    private reasoning: GutterWriter | null = null;
    private answer: GutterWriter | null = null;
    private text = "";

    constructor(private readonly spinner: Spinner) {}

    /** À passer tel quel à `chatCompletionStream` (le `this` est déjà lié). */
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
    };

    /** Texte de la réponse (raisonnement exclu) reçu jusqu'ici. */
    get answerText(): string {
        return this.text;
    }

    /** Vrai tant que rien n'a été écrit (ni raisonnement ni réponse). */
    get untouched(): boolean {
        return this.phase === "idle";
    }

    /** Referme le bloc en cours. À appeler une fois le flux terminé ou interrompu. */
    finish(): void {
        this.spinner.stop();
        if (this.phase === "answer") this.answer!.end();
        else if (this.phase === "reasoning") this.reasoning!.end();
    }

    private enter(phase: "reasoning" | "answer"): void {
        if (this.phase === phase) return;
        this.spinner.stop();

        if (phase === "reasoning") {
            sectionTitle("raisonnement", CYAN);
            this.reasoning = new GutterWriter(REASONING);
            this.reasoning.begin();
        } else {
            this.reasoning?.end();
            sectionTitle("réponse", ACCENT);
            this.answer = new GutterWriter(ANSWER);
            this.answer.begin();
        }
        this.phase = phase;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Programme
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM = "Tu es un assistant";

const logEnabled = process.argv.includes("--log");
const logFile = logEnabled ? `chat_${new Date().toISOString().replace(/[:.]/g, "-")}.log` : null;

async function log(role: string, content: string): Promise<void> {
    if (!logFile) return;
    const ts = new Date().toISOString();
    await appendFile(logFile, `[${ts}] [${role}]\n${content}\n\n`);
}

const llm = new LLM("http://localhost:8080", undefined, undefined, 300);

// À récupérer avant d'ouvrir readline : tant que l'interface écoute stdin, toute
// ligne qui arrive pendant un `await` sans `question()` actif serait perdue.
const contextSize = await llm.contextSize().catch(() => null);

const rl = readline.createInterface({input, output});

// Ctrl-C : interrompt la génération en cours si elle existe, sinon quitte proprement.
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

/** Lit une ligne au clavier ; renvoie null si l'entrée est fermée (Ctrl-D / EOF). */
async function ask(prompt: string): Promise<string | null> {
    try {
        return await rl.question(prompt);
    } catch {
        return null;
    }
}

banner(llm.endpoint, contextSize);

const systemAnswer = await ask(
    `${GUTTER}${dim("system prompt")} ${dim(`— Entrée pour « ${DEFAULT_SYSTEM} »`)}\n${GUTTER}${ACCENT}❯ ${RESET}`,
);
let systemPrompt = (systemAnswer ?? "").trim() || DEFAULT_SYSTEM;
if (systemPrompt.startsWith("file:")) {
    const filePath = systemPrompt.slice(5);
    try {
        systemPrompt = (await readFile(filePath, "utf-8")).trim();
        line(dim(`prompt chargé depuis ${filePath} (${systemPrompt.length} car.)`));
    } catch (e) {
        line(`${ERROR}✖ impossible de lire ${filePath}${RESET}  ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    }
}

systemPrompt += "\n\n" + systemPromptFormat;

const conv = new Conversation([new Message(Role.System, systemPrompt)]);

if (logFile) {
    await log("system", systemPrompt);
    line(dim(`log activé → ${logFile}`));
}

while (true) {
    line();
    const userMessage = await ask(`${GUTTER}${ACCENT}❯ ${RESET}`);
    if (userMessage === null || userMessage.trim() === "") {
        line(dim("au revoir 👋"));
        break;
    }
    conv.addMessage(new Message(Role.User, userMessage));
    await log("user", userMessage);

    const spinner = new Spinner("génération en cours…");
    spinner.start();

    abortController = new AbortController();
    const options = new ChatCompletionOptions();
    options.signal = abortController.signal;

    const renderer = new StreamRenderer(spinner);
    try {
        const result = await llm.chatCompletionStream(conv, options, renderer.onChunk);
        renderer.finish();

        const aborted = result.finishReason() === "aborted";
        if (renderer.untouched) {
            line();
            line(paint(ERROR, aborted ? "génération interrompue avant toute réponse" : "aucune réponse reçue"));
        }
        footer(result, aborted);

        if (renderer.answerText !== "") {

            const sepIndex = renderer.answerText.indexOf(reasoningSeparator);
            let assistantContent: string;
            if (sepIndex !== -1) {
                const shortReasoning = renderer.answerText.slice(0, sepIndex).trim();
                const realAnswer = renderer.answerText.slice(sepIndex + reasoningSeparator.length).trim();
                assistantContent = `<thought>${shortReasoning}</thought>${realAnswer}`;
            } else {
                assistantContent = renderer.answerText;
            }
            conv.addMessage(new Message(Role.Assistant, assistantContent));
            await log("assistant", assistantContent);
        }
    } catch (e) {
        renderer.finish();
        line();
        line(`${ERROR}✖ erreur${RESET}  ${e instanceof Error ? e.message : String(e)}`);
        line();
    } finally {
        abortController = null;
    }
}

rl.close();
