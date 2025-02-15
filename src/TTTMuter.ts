import { Server } from "http";
import {
  ActivityType,
  Client,
  GatewayIntentBits,
  Guild,
  PresenceData,
} from "discord.js";
import express, { Express } from "express";
import Logger from "@vertikarl/ts-logger";
import fs from "fs/promises";
import path from "path";
import { version as VERSION } from "./version";
import { Settings, MuteRequest } from "./types";
import bcrypt from "bcryptjs";

const SETTINGS_PATH = path.join(__dirname, "config.json");

const DEFAULT_SETTINGS: Settings = {
  DTTT_API_KEY: "",
  GUILD_ID: "",
  PORT: 37405,
  DISCORD_TOKEN: "",
  ADVERTISE_STREAM: "https://twitch.tv/vertiKarl",
  ENABLE_LEGACY_BACKEND: true,
};

export default class TTTMuter extends Logger {
  name = "TTT Muter";
  description = "Mutes People.";
  emoji = "🎮🔪";

  client?: Client;
  guild?: Guild;
  app?: Express;
  server?: Server;
  settings?: Settings;

  constructor() {
    super();
    this.init();
  }

  async loadSettings(): Promise<void> {
    this.debug("loading settings");
    return new Promise(async (resolve, reject) => {
      let exists = true;
      let password;
      this.debug("ARGS", process.argv);
      if (process.argv.length > 2 && process.argv.includes("-p")) {
        this.debug("Trying to handle provided password with p flag");
        const passwordProvided = process.argv.findIndex((value, index, obj) => {
          return value === "-p";
        });

        if (passwordProvided !== -1) {
          const passwordIndex = passwordProvided + 1;
          if (process.argv.length > passwordIndex) {
            password = process.argv[passwordIndex];
            this.info("Provided password", password);
            password = bcrypt.hashSync(password, 10);
          }
        }
      }

      try {
        const a = await fs.stat(SETTINGS_PATH);
      } catch (err) {
        exists = false;
      }

      if (!exists) {
        this.debug("writing file");
        let settings = DEFAULT_SETTINGS;
        this.warn(
          SETTINGS_PATH,
          "does not exist, creating...\n",
          "If this is your first time running this bot, please fill out the generated config.json file."
        );
        if (password) {
          settings.DTTT_API_KEY = password;
        }
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 4));
        reject();
        return;
      } else {
        this.debug("found file");
        try {
          const file = await fs.readFile(SETTINGS_PATH, "utf-8");
          let settings = JSON.parse(file);
          if (password) {
            this.warn(
              "Password provided even though file already exists, changing password!"
            );
            settings.DTTT_API_KEY = password;
            await fs.writeFile(
              SETTINGS_PATH,
              JSON.stringify(settings, null, 4)
            );
          }
          this.settings = settings;
          resolve();
          return;
        } catch (err) {
          this.error("Failed opening", SETTINGS_PATH);
          reject();
          return;
        }
      }
    });
  }

  checkSettings() {
    return (
      this.settings &&
      this.settings.DTTT_API_KEY.length > 5 &&
      this.settings.GUILD_ID.length > 5 &&
      this.settings.PORT > 0 &&
      this.settings.DISCORD_TOKEN.length > 5 &&
      typeof this.settings.ENABLE_LEGACY_BACKEND === "boolean"
    );
  }

  async init() {
    try {
      await this.loadSettings();
      await this.execute();
    } catch (err) {
      console.error(err);
      return;
    }
  }

  updateRPC() {
    if (!this.client?.user) return;

    const presence: PresenceData = {
      status: "online",
      activities: [
        {
          name: `TTT-Muter ${VERSION}`,
          type: ActivityType.Streaming,
          url: this.settings?.ADVERTISE_STREAM,
        },
      ],
    };

    this.debug("Updating rich presence to", presence);

    this.client.user.setPresence(presence);
  }

  async execute() {
    if (!this.settings || !this.checkSettings()) {
      this.error(
        "\nPlease fill out the config.json!\nIf this error persists, try deleting config.json and let it regenerate."
      );
      return;
    }

    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });

    this.client = client;

    client.on("ready", () => {
      if (!client?.user) return;

      this.info(`Logged in as ${client.user.tag}`);

      this.updateRPC();
    });

    await client.login(this.settings.DISCORD_TOKEN);

    this.client = client;

    this.guild = this.client.guilds.cache.get(this.settings.GUILD_ID);
    if (!this.guild) {
      this.error("Guild not found!");
      return;
    }

    this.app = express();

    this.routes();

    this.server = this.app.listen(this.settings.PORT, () => {
      this.info(`Bot endpoint is running on port ${this.settings?.PORT}`);
    });
  }

  routes() {
    if (!this.app) return;
    this.debug("Initializing routes");

    this.app.use(express.json({ limit: "10kb" }));
    this.app.use(express.urlencoded({ extended: true })); // support encoded bodies (required)

    this.app.use("/", async (req, res, next) => {
      this.debug(`[${req.method}] ${req.path}`);
      this.debug("[HEADERS]", req.headers);
      this.debug("[BODY]", req.body);

      if (!this.guild) {
        res.status(500).end();
        this.error("Guild is not set!");
        return;
      }

      if (
        // check if the user is authenticated with either a plaintext DTTT API key or a hashed DTTT API key
        req.headers.authorization &&
        (req.headers.authorization === `Basic ${this.settings?.DTTT_API_KEY}` ||
          (await bcrypt.compare(
            req.headers.authorization.split("Basic ")[1],
            this.settings!.DTTT_API_KEY
          )))
      ) {
        next();
        return;
      }

      this.info(
        `${req.ip} tried to request but was not authorized! (${req.headers.authorization})`
      );

      res
        .status(401)
        .json({
          errorId: "AUTHORIZATION_MISMATCH",
          errorMsg: "Authorization mismatch",
        })
        .end();
    });

    this.app.get("/id", (req, res, next) => {
      const { name, nick } = req.query;

      if (typeof name !== "string" || typeof nick !== "string") {
        res.status(400).end();
        this.error("Invalid request, parameters missing.");
        return;
      }

      const found = this.guild!.members.cache.find(
        (member) =>
          member.displayName === name ||
          member.displayName === nick ||
          member.displayName
            .toLowerCase()
            .match(new RegExp(`.*${name.toLowerCase()}.*`)) ||
          member.displayName
            .toLowerCase()
            .match(new RegExp(`.*${nick.toLowerCase()}.*`))
      );

      if (!found) {
        res.status(404).json({ answer: 0 }).end();
        this.error(`0 users found with name "${name}" or nick ${nick}.`);
      } else {
        res
          .status(200)
          .json({ name: found.displayName, nick: found.nickname, id: found.id })
          .end();
        this.info(
          `Success matched ${found.displayName} (${found.id}) to ${nick} (${name})`
        );
      }
    });

    this.app.post("/mute", async (req, res, next) => {
      let body: MuteRequest | MuteRequest[];
      try {
        body = req.body;
      } catch (err) {
        this.error("Couldn't parse request!", err);
        res.status(500).end();
        return;
      }

      if (!Array.isArray(body)) {
        body = [body];
      }

      for (const { id, status } of body) {
        if (id && typeof status === "boolean") {
          for (let i = 0; i < id.length; i++) {
            if (isNaN(Number(id[i]))) {
              res.status(400).end();
              this.warn("Invalid request received");
              return;
            }
          }
          try {
            const member = await this.guild!.members.fetch(id);
            await member.voice.setMute(
              status,
              status ? "dead players can't talk!" : undefined
            );
          } catch (err) {
            res.status(500).end();
            this.error("Couldn't resolve id", id);
            return;
          }
        } else {
          this.error("Invalid request");
          res.status(400).end();
          return;
        }
      }
      res.status(200).json({ success: true }).end();
      this.info(`[Success]`);
      return;
    });

    this.app.post("/deafen", async (req, res, next) => {
      let body: MuteRequest | MuteRequest[];
      try {
        body = req.body;
      } catch (err) {
        this.error("Couldn't parse request!", err);
        res.status(500).end();
        return;
      }

      if (!Array.isArray(body)) {
        body = [body];
      }

      for (const { id, status } of body) {
        if (id && typeof status === "boolean") {
          for (let i = 0; i < id.length; i++) {
            if (isNaN(Number(id[i]))) {
              res.status(400).end();
              this.warn("Invalid request received");
              return;
            }
          }
          try {
            const member = await this.guild!.members.fetch(id);
            await member.voice.setDeaf(
              status,
              status ? "dead players can't hear!" : undefined
            );
          } catch (err) {
            res.status(500).end();
            this.error("Couldn't resolve id", id);
            return;
          }
        } else {
          this.error("Invalid request");
          res.status(400).end();
          return;
        }
      }
      res.status(200).json({ success: true }).end();
      this.info(`[Success]`);
      return;
    });

    if (this.settings?.ENABLE_LEGACY_BACKEND) {
      this.info("Loading legacy routes");
      this.app.get("/", async (req, res, next) => {
        this.warn("Hitting legacy backend");
        let params: any | undefined;
        try {
          if (typeof req.headers.req !== "string") {
            res.status(400).end();
            this.debug("Received invalid request");
            return;
          }
          if (typeof req.headers.params === "string") {
            params = JSON.parse(req.headers.params);
          }
        } catch (err) {
          res.status(500).end();
          this.debug("Received invalid request", err);
          return;
        }

        this.debug("REQUEST", req.headers.req);

        switch (req.headers.req) {
          case "connect": {
            if (!params.tag || typeof params.tag !== "string") {
              res.status(400).end();
              this.error("no tag!");
              return;
            }

            const tag = (params.tag as String).toLowerCase();

            const found = this.guild!.members.cache.find(
              (member) =>
                member.displayName === tag ||
                member.displayName
                  .toLowerCase()
                  .match(new RegExp(`.*${tag.toLowerCase()}.*`))
            );

            if (!found) {
              res.status(404).json({ answer: 0 });
              this.error(
                "[LegacyConnect][Error]",
                `0 users found with tag "${tag}".`
              );
              return;
            } else {
              res.status(200).json({ tag: found.displayName, id: found.id });
              this.info(
                "[LegacyConnect][Success]",
                `Connecting ${found.displayName} (${found.id})`
              );
              return;
            }
          }
          case "sync": {
            res.json({
              success: true,
              version: VERSION,
              debugMode: this.debug,
              discordGuild: this.guild?.id,
            });
            this.info("[LegacySync][Request]", params);
            return;
          }
          case "keep_alive": {
            res.json({ success: true });
            this.info("[LegacyKeepAlive][Request]", params);
            break;
          }
          case "mute": {
            const { id, mute } = params;

            if (typeof id !== "string" || typeof mute !== "boolean") {
              res
                .status(400)
                .json({
                  success: false,
                  errorId: "INVALID_PARAMS",
                  errorMsg: "ID or Mute value missing",
                })
                .end();
              this.error(
                "[LegacyMute][Missing Params]",
                `id: "${id}" (${typeof id}), mute: "${mute}" (${typeof mute})`
              );
              return;
            }

            try {
              const member = await this.guild!.members.fetch(id);
              await member.voice.setMute(
                mute,
                mute ? "dead players can't talk!" : undefined
              );
              res.status(200).json({ success: true });
              this.info(
                `[LegacyMute][Discord:SetMute][Success]`,
                `${mute ? "Muted" : "Unmuted"} ${id}`
              );
            } catch (err) {
              res
                .status(500)
                .json({
                  success: false,
                  errorId: "DISCORD_ERROR",
                  errorMsg: err,
                })
                .end();
              this.error(
                `[LegacyMute][Discord:SetMute][Error]`,
                `${mute ? "Mute" : "Unmute"}: ${id} - ${err}`
              );
            }
            break;
          }
        }
      });
    }
  }
}
