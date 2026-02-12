import crypto from "node:crypto";
import http from "node:http";

import { formatStructuredLog } from "@kanban/utils";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

type DiscordConfig = {
  publicKeyHex: string;
  applicationId: string;
  botToken?: string;
  guildId?: string;
  port: number;
  apiBaseUrl: string;
  webBaseUrl: string;
  apiInternalToken: string;
};

type DiscordInteraction = {
  id: string;
  token: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user?: {
      id: string;
      username: string;
      discriminator: string;
    };
  };
  user?: { id: string };
  data?: {
    name?: string;
    options?: Array<any>;
  };
};

type CommandDescriptor = {
  name: string;
  subcommand?: string;
  options?: any[];
};

const requireEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const loadConfig = (): DiscordConfig => {
  const port = Number(process.env.DISCORD_PORT ?? 3003);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("DISCORD_PORT must be a positive number.");
  }

  return {
    publicKeyHex: requireEnv("DISCORD_PUBLIC_KEY"),
    applicationId: requireEnv("DISCORD_APPLICATION_ID"),
    botToken: process.env.DISCORD_BOT_TOKEN?.trim() || undefined,
    guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    port,
    apiBaseUrl: process.env.API_BASE_URL?.trim() || "http://localhost:3001",
    webBaseUrl: process.env.WEB_BASE_URL?.trim() || "http://localhost:3002",
    apiInternalToken: requireEnv("DISCORD_INTERNAL_TOKEN")
  };
};

const toEd25519SpkiDer = (publicKeyHex: string): Buffer => {
  const raw = Buffer.from(publicKeyHex, "hex");
  if (raw.length !== 32) {
    throw new Error("DISCORD_PUBLIC_KEY must be 32 bytes hex (64 hex chars).");
  }

  // ASN.1 SubjectPublicKeyInfo prefix for Ed25519 public keys.
  // See RFC 8410: id-Ed25519 OID 1.3.101.112
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return Buffer.concat([prefix, raw]);
};

const verifyDiscordSignature = (args: {
  publicKeyHex: string;
  signatureHex: string;
  timestamp: string;
  body: Buffer;
}): boolean => {
  const keyDer = toEd25519SpkiDer(args.publicKeyHex);
  const key = crypto.createPublicKey({ key: keyDer, format: "der", type: "spki" });
  const signature = Buffer.from(args.signatureHex, "hex");
  const message = Buffer.from(`${args.timestamp}${args.body.toString("utf8")}`, "utf8");

  if (signature.length !== 64) {
    return false;
  }

  return crypto.verify(null, message, key, signature);
};

const json = (res: http.ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
};

const listenServer = (
  server: http.Server,
  port: number
): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });

const getInteractionUserId = (interaction: DiscordInteraction): string | null =>
  interaction.member?.user?.id ?? interaction.user?.id ?? null;

const getCommand = (interaction: DiscordInteraction): { name: string; subcommand?: string; options?: any[] } | null => {
  const name = interaction.data?.name;
  if (!name) return null;

  const topOptions = interaction.data?.options ?? [];
  const sub = topOptions[0];
  if (sub?.type === 1 && typeof sub.name === "string") {
    return { name, subcommand: sub.name, options: sub.options ?? [] };
  }

  return { name, options: topOptions };
};

const getStringOption = (options: any[] | undefined, key: string): string | null => {
  if (!options) return null;
  const match = options.find((opt) => opt?.type === 3 && opt?.name === key);
  const value = match?.value;
  return typeof value === "string" ? value : null;
};

const getIntegerOption = (options: any[] | undefined, key: string): number | null => {
  if (!options) return null;
  const match = options.find((opt) => opt?.type === 4 && opt?.name === key);
  const value = match?.value;
  return Number.isInteger(value) ? Number(value) : null;
};

const LABEL_COLORS = new Set([
  "gray",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "teal"
]);

const parseNullableStringOption = (value: string | null): string | null | undefined => {
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.toLowerCase() === "clear") {
    return null;
  }
  return normalized;
};

const parseNullableDateOption = (value: string | null): string | null | undefined => {
  const normalized = parseNullableStringOption(value);
  if (normalized === undefined || normalized === null) {
    return normalized;
  }

  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00.000Z`)
    : new Date(normalized);

  if (Number.isNaN(dateValue.valueOf())) {
    throw new Error(`Invalid date value: ${normalized}`);
  }
  return dateValue.toISOString();
};

const parseCsv = (value: string | null): string[] | undefined => {
  const normalized = parseNullableStringOption(value);
  if (normalized === undefined || normalized === null) {
    return undefined;
  }

  const parts = normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
};

const parseLabelsOption = (
  value: string | null
): Array<{ name: string; color: string }> | undefined => {
  const entries = parseCsv(value);
  if (!entries) {
    return undefined;
  }

  const labels = entries.map((entry) => {
    const [namePart, colorPart] = entry.split(":");
    const name = namePart?.trim();
    const color = colorPart?.trim().toLowerCase();

    if (!name || !color || !LABEL_COLORS.has(color)) {
      throw new Error(
        `Invalid label "${entry}". Use name:color with color in ${Array.from(LABEL_COLORS).join(", ")}`
      );
    }

    return {
      name,
      color
    };
  });

  return labels.length > 0 ? labels : undefined;
};

const parseChecklistOption = (
  value: string | null
): Array<{ title: string; isDone: boolean; position: number }> | undefined => {
  const entries = parseCsv(value);
  if (!entries) {
    return undefined;
  }

  const items = entries
    .map((entry, index) => {
      const normalized = entry.trim();
      if (!normalized) {
        return null;
      }

      let isDone = false;
      let title = normalized;
      if (normalized.startsWith("x:") || normalized.startsWith("[x]")) {
        isDone = true;
        title = normalized.replace(/^x:\s*/i, "").replace(/^\[x\]\s*/i, "");
      }

      return {
        title: title.trim(),
        isDone,
        position: index * 1024
      };
    })
    .filter(
      (item): item is { title: string; isDone: boolean; position: number } =>
        Boolean(item && item.title)
    );

  return items.length > 0 ? items : undefined;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const truncate = (value: string, max = 1800): string =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
  private server: http.Server | null = null;
  private config: DiscordConfig | null = null;

  async onModuleInit(): Promise<void> {
    const config = loadConfig();
    this.config = config;

    await this.registerCommands(config).catch((error) => {
      process.stdout.write(
        formatStructuredLog({
          level: "warn",
          message: "discord: command registration failed",
          context: { message: error instanceof Error ? error.message : String(error) }
        }) + "\n"
      );
    });

    const server = http.createServer((req, res) => void this.handleRequest(req, res));
    server.on("error", (error) => {
      process.stdout.write(
        formatStructuredLog({
          level: "error",
          message: "discord: interactions server error",
          context: { message: error instanceof Error ? error.message : String(error) }
        }) + "\n"
      );
    });

    try {
      await listenServer(server, config.port);
    } catch (error) {
      server.close();
      throw new Error(
        `Failed to bind DISCORD_PORT=${config.port}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    this.server = server;

    process.stdout.write(
      formatStructuredLog({
        level: "info",
        message: "discord: interactions server listening",
        context: { port: config.port, path: "/interactions" }
      }) + "\n"
    );
  }

  async onModuleDestroy(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  private async registerCommands(config: DiscordConfig): Promise<void> {
    if (!config.botToken) {
      process.stdout.write(
        formatStructuredLog({
          level: "warn",
          message: "discord: DISCORD_BOT_TOKEN not set; skipping command registration"
        }) + "\n"
      );
      return;
    }

    const commands = [
      {
        name: "connect",
        description: "Link your Discord account to your Supabase user",
        type: 1
      },
      {
        name: "my",
        description: "My commands",
        type: 1,
        options: [
          {
            type: 1,
            name: "tasks",
            description: "List tasks for this channel"
          }
        ]
      },
      {
        name: "card",
        description: "Card commands",
        type: 1,
        options: [
          {
            type: 1,
            name: "create",
            description: "Create a card in this channel's default list",
            options: [
              {
                type: 3,
                name: "title",
                description: "Card title",
                required: true
              },
              {
                type: 3,
                name: "description",
                description: "Card description",
                required: false
              }
            ]
          },
          {
            type: 1,
            name: "move",
            description: "Move a card to another list by UUID",
            options: [
              {
                type: 3,
                name: "card_id",
                description: "Card UUID",
                required: true
              },
              {
                type: 3,
                name: "to_list_id",
                description: "Target list UUID",
                required: true
              }
            ]
          },
          {
            type: 1,
            name: "edit",
            description: "Edit enriched card fields by UUID",
            options: [
              {
                type: 3,
                name: "card_id",
                description: "Card UUID",
                required: true
              },
              {
                type: 3,
                name: "title",
                description: "Card title (or omit)",
                required: false
              },
              {
                type: 3,
                name: "description",
                description: 'Description text. Use "clear" to reset.',
                required: false
              },
              {
                type: 3,
                name: "start_at",
                description: 'Start date ISO or YYYY-MM-DD. Use "clear" to reset.',
                required: false
              },
              {
                type: 3,
                name: "due_at",
                description: 'Due date ISO or YYYY-MM-DD. Use "clear" to reset.',
                required: false
              },
              {
                type: 3,
                name: "location_text",
                description: 'Location text. Use "clear" to reset.',
                required: false
              },
              {
                type: 3,
                name: "location_url",
                description: 'Location URL. Use "clear" to reset.',
                required: false
              },
              {
                type: 3,
                name: "assignees",
                description: "Comma-separated assignee UUIDs.",
                required: false
              },
              {
                type: 3,
                name: "labels",
                description: "Comma list name:color (color in gray/green/yellow/orange/red/purple/blue/teal).",
                required: false
              },
              {
                type: 3,
                name: "checklist",
                description: "Comma list items. Prefix x: or [x] to mark done.",
                required: false
              }
            ]
          },
          {
            type: 1,
            name: "summarize",
            description: "Generate AI summary for a card by UUID",
            options: [
              {
                type: 3,
                name: "card_id",
                description: "Card UUID",
                required: true
              },
              {
                type: 3,
                name: "reason",
                description: "Optional summary focus",
                required: false
              }
            ]
          }
        ]
      },
      {
        name: "ai",
        description: "AI commands",
        type: 1,
        options: [
          {
            type: 1,
            name: "ask",
            description: "Ask the mapped board a question",
            options: [
              {
                type: 3,
                name: "question",
                description: "Question to ask",
                required: true
              },
              {
                type: 4,
                name: "top_k",
                description: "Max reference chunks (1-20)",
                required: false
              }
            ]
          }
        ]
      }
    ];

    const route = config.guildId
      ? `https://discord.com/api/v10/applications/${config.applicationId}/guilds/${config.guildId}/commands`
      : `https://discord.com/api/v10/applications/${config.applicationId}/commands`;

    const response = await fetch(route, {
      method: "PUT",
      headers: {
        authorization: `Bot ${config.botToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(commands)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Discord command registration failed (${response.status}): ${text}`);
    }

    process.stdout.write(
      formatStructuredLog({
        level: "info",
        message: "discord: commands registered",
        context: { guildCommands: Boolean(config.guildId) }
      }) + "\n"
    );
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const config = this.config;
    if (!config) {
      res.statusCode = 500;
      res.end("Discord service not initialized.");
      return;
    }

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const isInteractionsPath =
      requestUrl.pathname === "/interactions" || requestUrl.pathname === "/interactions/";

    if (req.method !== "POST" || !isInteractionsPath) {
      res.statusCode = 404;
      res.end("Not found.");
      return;
    }

    const signature = String(req.headers["x-signature-ed25519"] ?? "");
    const timestamp = String(req.headers["x-signature-timestamp"] ?? "");
    const startedAt = Date.now();

    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        process.stdout.write(
          formatStructuredLog({
            level: "info",
            message: "discord: interaction request received",
            context: {
              path: requestUrl.pathname,
              bodyBytes: body.length,
              hasSignature: Boolean(signature),
              hasTimestamp: Boolean(timestamp)
            }
          }) + "\n"
        );

        const valid =
          signature &&
          timestamp &&
          verifyDiscordSignature({
            publicKeyHex: config.publicKeyHex,
            signatureHex: signature,
            timestamp,
            body
          });

        if (!valid) {
          process.stdout.write(
            formatStructuredLog({
              level: "warn",
              message: "discord: interaction signature validation failed",
              context: { durationMs: Date.now() - startedAt }
            }) + "\n"
          );
          res.statusCode = 401;
          res.end("Invalid request signature.");
          return;
        }

        const interaction = JSON.parse(body.toString("utf8")) as DiscordInteraction;

        // PING
        if (interaction.type === 1) {
          process.stdout.write(
            formatStructuredLog({
              level: "info",
              message: "discord: ping interaction acked",
              context: { durationMs: Date.now() - startedAt }
            }) + "\n"
          );
          json(res, 200, { type: 1 });
          return;
        }

        const command = getCommand(interaction);
        const userId = getInteractionUserId(interaction);
        const guildId = interaction.guild_id;
        const channelId = interaction.channel_id;

        if (!command || !userId || !guildId || !channelId) {
          process.stdout.write(
            formatStructuredLog({
              level: "warn",
              message: "discord: command missing required guild/channel/user context",
              context: {
                hasCommand: Boolean(command),
                hasUserId: Boolean(userId),
                hasGuildId: Boolean(guildId),
                hasChannelId: Boolean(channelId)
              }
            }) + "\n"
          );
          json(res, 200, {
            type: 4,
            data: {
              content: "This command must be used in a server channel.",
              flags: 64
            }
          });
          return;
        }

        process.stdout.write(
          formatStructuredLog({
            level: "info",
            message: "discord: slash command received",
            context: {
              command: command.name,
              subcommand: command.subcommand,
              guildId,
              channelId
            }
          }) + "\n"
        );

        if (command.name === "connect") {
          const connectUrl = new URL("/connect.html", config.webBaseUrl);
          connectUrl.searchParams.set("discord_user_id", userId);

          json(res, 200, {
            type: 4,
            data: {
              flags: 64,
              content: [
                "Open this link to connect your Discord identity:",
                `\`${connectUrl.toString()}\``,
                "",
                "After linking, come back and run `/my tasks`."
              ].join("\n")
            }
          });
          return;
        }

        // Defer immediately; do async follow-up edit.
        json(res, 200, { type: 5, data: { flags: 64 } });

        void this.handleCommandAsync({
          config,
          interaction,
          discordUserId: userId,
          guildId,
          channelId,
          command
        });
      } catch (error) {
        process.stdout.write(
          formatStructuredLog({
            level: "error",
            message: "discord: interaction handling failed",
            context: { message: error instanceof Error ? error.message : String(error) }
          }) + "\n"
        );
        json(res, 200, {
          type: 4,
          data: {
            flags: 64,
            content: `Internal error: ${error instanceof Error ? error.message : String(error)}`
          }
        });
      }
    });
  }

  private async handleCommandAsync(args: {
    config: DiscordConfig;
    interaction: DiscordInteraction;
    discordUserId: string;
    guildId: string;
    channelId: string;
    command: CommandDescriptor;
  }): Promise<void> {
    const { config, interaction, discordUserId, guildId, channelId, command } = args;

    try {
      if (command.name === "my" && command.subcommand === "tasks") {
        const snapshot = await this.callApi(config, discordUserId, "/discord/commands/my-tasks", {
          guildId,
          channelId,
          limit: 25
        });

        const lines: string[] = [];
        lines.push(`Board: **${snapshot.board.title}**`);
        lines.push(`Board ID: \`${snapshot.board.id}\``);
        if (snapshot.defaultListId) {
          lines.push(`Default List ID: \`${snapshot.defaultListId}\``);
        }

        const cardsByList = new Map<string, any[]>();
        for (const card of snapshot.cards ?? []) {
          const bucket = cardsByList.get(card.listId) ?? [];
          bucket.push(card);
          cardsByList.set(card.listId, bucket);
        }

        for (const list of snapshot.lists ?? []) {
          lines.push("");
          lines.push(`**${list.title}** (\`${list.id}\`)`);
          const cards = cardsByList.get(list.id) ?? [];
          if (cards.length === 0) {
            lines.push("- (none)");
            continue;
          }
          for (const card of cards.slice(0, 8)) {
            lines.push(`- \`${card.id}\` ${card.title}`);
          }
        }

        await this.editOriginalResponse(config, interaction, lines.join("\n").slice(0, 1900));
        return;
      }

      if (command.name === "card" && command.subcommand === "create") {
        const title = getStringOption(command.options, "title");
        if (!title) {
          await this.editOriginalResponse(config, interaction, "Missing required option: title");
          return;
        }

        const description = getStringOption(command.options, "description") ?? undefined;

        const result = await this.callApi(config, discordUserId, "/discord/commands/card-create", {
          guildId,
          channelId,
          title,
          description
        });

        await this.editOriginalResponse(
          config,
          interaction,
          `Created card \`${result.card.id}\` in list \`${result.card.listId}\`: ${result.card.title}`
        );
        return;
      }

      if (command.name === "card" && command.subcommand === "move") {
        const cardId = getStringOption(command.options, "card_id");
        const toListId = getStringOption(command.options, "to_list_id");

        if (!cardId || !toListId) {
          await this.editOriginalResponse(
            config,
            interaction,
            "Missing required options: card_id, to_list_id"
          );
          return;
        }

        const result = await this.callApi(config, discordUserId, "/discord/commands/card-move", {
          guildId,
          channelId,
          cardId,
          toListId
        });

        await this.editOriginalResponse(
          config,
          interaction,
          `Moved card \`${result.card.id}\` to list \`${result.card.listId}\`.`
        );
        return;
      }

      if (command.name === "card" && command.subcommand === "edit") {
        const cardId = getStringOption(command.options, "card_id");
        if (!cardId) {
          await this.editOriginalResponse(
            config,
            interaction,
            "Missing required option: card_id"
          );
          return;
        }

        const title = parseNullableStringOption(getStringOption(command.options, "title"));
        const description = parseNullableStringOption(
          getStringOption(command.options, "description")
        );
        const startAt = parseNullableDateOption(getStringOption(command.options, "start_at"));
        const dueAt = parseNullableDateOption(getStringOption(command.options, "due_at"));
        const locationText = parseNullableStringOption(
          getStringOption(command.options, "location_text")
        );
        const locationUrl = parseNullableStringOption(
          getStringOption(command.options, "location_url")
        );
        const assigneeUserIds = parseCsv(getStringOption(command.options, "assignees"));
        const labels = parseLabelsOption(getStringOption(command.options, "labels"));
        const checklist = parseChecklistOption(getStringOption(command.options, "checklist"));

        const payload: Record<string, unknown> = {
          guildId,
          channelId,
          cardId
        };

        if (title !== undefined && title !== null) {
          payload.title = title;
        }
        if (description !== undefined) {
          payload.description = description;
        }
        if (startAt !== undefined) {
          payload.startAt = startAt;
        }
        if (dueAt !== undefined) {
          payload.dueAt = dueAt;
        }
        if (locationText !== undefined) {
          payload.locationText = locationText;
        }
        if (locationUrl !== undefined) {
          payload.locationUrl = locationUrl;
        }
        if (assigneeUserIds !== undefined) {
          payload.assigneeUserIds = assigneeUserIds;
        }
        if (labels !== undefined) {
          payload.labels = labels;
        }
        if (checklist !== undefined) {
          payload.checklist = checklist;
        }

        const result = await this.callApi(config, discordUserId, "/discord/commands/card-edit", payload);
        const updated = result.card;

        const summaryLines = [
          `Updated card \`${updated.id}\`: ${updated.title}`,
          `list: \`${updated.listId}\` | version: ${updated.version}`,
          `due: ${updated.dueAt ?? "none"} | start: ${updated.startAt ?? "none"}`,
          `assignees: ${(updated.assigneeUserIds ?? []).length} | labels: ${(updated.labels ?? []).length}`,
          `checklist: ${(updated.checklist ?? []).filter((item: any) => item.isDone).length}/${(updated.checklist ?? []).length}`,
          `comments: ${updated.commentCount ?? 0} | attachments: ${updated.attachmentCount ?? 0}`
        ];

        await this.editOriginalResponse(config, interaction, summaryLines.join("\n"));
        return;
      }

      if (command.name === "card" && command.subcommand === "summarize") {
        const cardId = getStringOption(command.options, "card_id");
        const reason = getStringOption(command.options, "reason") ?? undefined;

        if (!cardId) {
          await this.editOriginalResponse(
            config,
            interaction,
            "Missing required option: card_id"
          );
          return;
        }

        const queued = await this.callApi(
          config,
          discordUserId,
          "/discord/commands/card-summarize",
          {
            guildId,
            channelId,
            cardId,
            reason
          }
        );

        const status = await this.pollCardSummaryStatus({
          config,
          discordUserId,
          guildId,
          channelId,
          cardId
        });

        if (status?.status === "completed" && status.summary) {
          const content = [
            `Card \`${cardId}\` summary`,
            "",
            `**Summary**`,
            status.summary.summary,
            "",
            status.summary.highlights.length
              ? `**Highlights**\n${status.summary.highlights.map((item: string) => `- ${item}`).join("\n")}`
              : "",
            status.summary.risks.length
              ? `**Risks**\n${status.summary.risks.map((item: string) => `- ${item}`).join("\n")}`
              : "",
            status.summary.actionItems.length
              ? `**Action Items**\n${status.summary.actionItems.map((item: string) => `- ${item}`).join("\n")}`
              : ""
          ]
            .filter(Boolean)
            .join("\n");
          await this.editOriginalResponse(config, interaction, truncate(content, 1900));
          return;
        }

        await this.editOriginalResponse(
          config,
          interaction,
          `Summary job queued (\`${queued.jobId}\`). Still processing; run the command again in a moment.`
        );
        return;
      }

      if (command.name === "ai" && command.subcommand === "ask") {
        const question = getStringOption(command.options, "question");
        const topK = getIntegerOption(command.options, "top_k") ?? undefined;

        if (!question) {
          await this.editOriginalResponse(
            config,
            interaction,
            "Missing required option: question"
          );
          return;
        }

        const queued = await this.callApi(
          config,
          discordUserId,
          "/discord/commands/ask-board",
          {
            guildId,
            channelId,
            question,
            topK
          }
        );

        const status = await this.pollAskBoardStatus({
          config,
          discordUserId,
          guildId,
          channelId,
          jobId: queued.jobId
        });

        if (status?.status === "completed" && status.answer) {
          const references = status.answer.references
            .slice(0, 5)
            .map(
              (reference: any, index: number) =>
                `${index + 1}. [${reference.sourceType}] ${truncate(reference.excerpt, 120)}`
            )
            .join("\n");

          const content = [
            `Question: ${question}`,
            "",
            `**Answer**`,
            status.answer.answer,
            "",
            references ? `**References**\n${references}` : ""
          ]
            .filter(Boolean)
            .join("\n");

          await this.editOriginalResponse(config, interaction, truncate(content, 1900));
          return;
        }

        await this.editOriginalResponse(
          config,
          interaction,
          `Ask-board job queued (\`${queued.jobId}\`). Still processing; run the command again shortly.`
        );
        return;
      }

      await this.editOriginalResponse(config, interaction, "Unknown command.");
    } catch (error) {
      await this.editOriginalResponse(
        config,
        interaction,
        `Command failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async editOriginalResponse(
    config: DiscordConfig,
    interaction: DiscordInteraction,
    content: string
  ): Promise<void> {
    const url = `https://discord.com/api/v10/webhooks/${config.applicationId}/${interaction.token}/messages/@original`;
    await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000) })
    });
  }

  private async callApi(
    config: DiscordConfig,
    discordUserId: string,
    path: string,
    body: unknown
  ): Promise<any> {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-discord-internal-token": config.apiInternalToken,
        "x-discord-user-id": discordUserId
      },
      body: JSON.stringify(body)
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.message ?? `API error (${response.status})`);
    }

    return json;
  }

  private async pollCardSummaryStatus(args: {
    config: DiscordConfig;
    discordUserId: string;
    guildId: string;
    channelId: string;
    cardId: string;
  }): Promise<any | null> {
    let latest: any | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      latest = await this.callApi(
        args.config,
        args.discordUserId,
        "/discord/commands/card-summary-status",
        {
          guildId: args.guildId,
          channelId: args.channelId,
          cardId: args.cardId
        }
      );

      if (latest?.status === "completed" || latest?.status === "failed") {
        return latest;
      }

      await sleep(1500);
    }

    return latest;
  }

  private async pollAskBoardStatus(args: {
    config: DiscordConfig;
    discordUserId: string;
    guildId: string;
    channelId: string;
    jobId: string;
  }): Promise<any | null> {
    let latest: any | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await this.callApi(
        args.config,
        args.discordUserId,
        "/discord/commands/ask-board-status",
        {
          guildId: args.guildId,
          channelId: args.channelId,
          jobId: args.jobId
        }
      );

      if (latest?.status === "completed" || latest?.status === "failed") {
        return latest;
      }

      await sleep(1500);
    }

    return latest;
  }
}
