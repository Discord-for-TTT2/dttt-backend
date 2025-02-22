import { Server } from "http";
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  PresenceData,
  REST,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
} from "discord.js";
import express, { Express } from "express";
import Logger from "@vertikarl/ts-logger";
import fs from "fs/promises";
import path from "path";
import { version as VERSION } from "./version";
import bcrypt from "bcryptjs";
import AuthRoute from "./routes/auth";
import IdRoute from "./routes/id";
import MuteRoute from "./routes/mute";
import DeafenRoute from "./routes/deafen";
import LegacyRoutes from "./routes/legacy";
import InviteCommand from "./commands/invite";
import Command from "./Command";

const SETTINGS_PATH = path.join(__dirname, "config.json");

export interface Settings {
  DTTT_API_KEY: string;
  GUILD_ID: string;
  PORT: number;
  DISCORD_TOKEN: string;
  DISCORD_CLIENT_ID?: string;
  ADVERTISE_STREAM: string;
  ENABLE_LEGACY_BACKEND: boolean;
  SERVER_ADDRESS?: string;
  SERVER_PORT?: number;
  commands: Map<string, any>;
  LISTEN_ADDRESS?: string;
}

const DEFAULT_SETTINGS: Settings = {
  DTTT_API_KEY: "",
  GUILD_ID: "",
  PORT: 37405,
  DISCORD_TOKEN: "",
  ADVERTISE_STREAM: "https://twitch.tv/vertiKarl",
  ENABLE_LEGACY_BACKEND: true,
  commands: new Map<string, any>(),
};

const DEFAULT_COMMANDS = [new InviteCommand()];
const LOGGER = new Logger("🎮🔪", true);

export default class TTTMuter {
  name = "TTT Muter";
  description = "Mutes People.";

  client?: Client;
  guild?: Guild;
  app?: Express;
  server?: Server;
  settings?: Settings;
  commands: Map<string, Command> = new Map(
    DEFAULT_COMMANDS.map((cmd) => [cmd.name, cmd])
  );

  constructor() {
    this.init();
  }

  async loadSettings(): Promise<void> {
    LOGGER.debug("loading settings");
    return new Promise(async (resolve, reject) => {
      let exists = true;
      let password;
      LOGGER.debug("ARGS", process.argv);
      if (process.argv.length > 2 && process.argv.includes("-p")) {
        LOGGER.debug("Trying to handle provided password with p flag");
        const passwordProvided = process.argv.findIndex((value, index, obj) => {
          return value === "-p";
        });

        if (passwordProvided !== -1) {
          const passwordIndex = passwordProvided + 1;
          if (process.argv.length > passwordIndex) {
            password = process.argv[passwordIndex];
            LOGGER.info("Provided password", password);
            password = bcrypt.hashSync(password, 10);
          }
        }
      }

      try {
        await fs.stat(SETTINGS_PATH);
      } catch (err) {
        exists = false;
      }

      if (!exists) {
        LOGGER.debug("writing file");
        let settings = DEFAULT_SETTINGS;
        LOGGER.warn(
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
        LOGGER.debug("found file");
        try {
          const file = await fs.readFile(SETTINGS_PATH, "utf-8");
          let settings = JSON.parse(file);
          if (password) {
            LOGGER.warn(
              "Password provided even though file already exists, changing password!"
            );
            settings.DTTT_API_KEY = password;
            await fs.writeFile(
              SETTINGS_PATH,
              JSON.stringify(settings, null, 4)
            );
          }
          if (typeof settings.commands === "undefined")
            settings.commands = DEFAULT_SETTINGS.commands;
          else {
            settings.commands = new Map(Object.entries(settings.commands));
          }
          this.settings = settings;
          resolve();
          return;
        } catch (err) {
          LOGGER.error("Failed opening", SETTINGS_PATH, err);
          reject();
          return;
        }
      }
    });
  }

  async saveSettings() {
    try {
      await fs.stat(SETTINGS_PATH);
    } catch (err) {
      LOGGER.error(
        "Couldn't save settings, file either does not exist or permission denied."
      );
      return;
    }

    if (!this.settings) {
      LOGGER.error("Settings went missing!");
      return;
    }
    // this might look wonky but is need to create a deep copy of the settings
    // and allow writing settings to disk without changing the runtime object
    const settings: any = JSON.parse(JSON.stringify(this.settings));
    settings.commands = Object.fromEntries(this.settings.commands);

    fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 4))
      .then(() => {
        LOGGER.info("Settings successfully saved to disk!");
      })
      .catch((err) => {
        LOGGER.error("Couldn't save settings", err);
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
          url:
            this.settings?.ADVERTISE_STREAM ||
            DEFAULT_SETTINGS.ADVERTISE_STREAM,
        },
      ],
    };

    LOGGER.debug("Updating rich presence");

    this.client.user.setPresence(presence);
  }

  async execute() {
    if (!this.settings || !this.checkSettings()) {
      throw new Error(
        "Please fill out the config.json!\nIf this error persists, try deleting config.json and let it regenerate."
      );
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.client = client;

    client.on("ready", async () => {
      if (!client?.user) return;

      await this.initCommands(); // only do this once in production

      LOGGER.info(`Logged in as ${client.user.tag}`);

      this.updateRPC();
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      if (!this.settings) {
        interaction.reply("Sorry something went wrong!");
        LOGGER.error(
          "[Interaction]",
          "Canceled interaction as settings went missing!"
        );
        return;
      }

      await interaction.deferReply();

      const cmd = this.commands.get(interaction.commandName);
      if (!cmd) {
        await interaction.reply(
          `Command ${interaction.commandName} does not exist!`
        );
      } else {
        const savedSettings = this.settings.commands.get(cmd.name);
        if (cmd.settings && savedSettings) {
          cmd.settings = JSON.parse(JSON.stringify(savedSettings));
        }

        if (cmd.permissions.length > 0) {
          if (!interaction.memberPermissions?.has(cmd.permissions)) {
            return interaction.editReply(
              "Sorry but you do not have the permissions to execute this command!"
            );
          }
        }

        cmd
          .execute({
            interaction,
            logger: LOGGER,
            client,
            serverAddress: this.settings.SERVER_ADDRESS,
            serverPort: this.settings.SERVER_PORT,
          })
          .then(() => {
            LOGGER.debug("cmd.settings", cmd.settings);
            LOGGER.debug("savedSettings", savedSettings);
            if (
              cmd.settings &&
              JSON.stringify(cmd.settings) != JSON.stringify(savedSettings)
            ) {
              LOGGER.info(
                `Command ${cmd.name} changed settings, saving to disk.`
              );

              if (!this.settings) {
                LOGGER.error(
                  "Settings went missing! Abort saving command settings."
                );
                return;
              }

              this.settings.commands.set(cmd.name, cmd.settings);
              LOGGER.debug(this.settings.commands);
              this.saveSettings();
            }
          })
          .catch((err) => {
            LOGGER.error("Something went wrong when executing", cmd.name, err);
          });
      }
    });

    await client.login(this.settings.DISCORD_TOKEN);

    this.client = client;

    this.guild = this.client.guilds.cache.get(this.settings.GUILD_ID);
    if (!this.guild) {
      throw new Error("Guild not found!");
    }

    this.app = express();

    this.routes();

    this.server = this.app.listen(
      this.settings.PORT,
      this.settings.LISTEN_ADDRESS || "",
      () => {
        LOGGER.info(`Bot endpoint is running on port ${this.settings?.PORT}`);
        if (this.settings?.LISTEN_ADDRESS)
          LOGGER.info(
            `Listening on interface with ip ${this.settings.LISTEN_ADDRESS}`
          );
        else
          LOGGER.warn(
            `\nListening on all interfaces\n→ consider restricting access via the option "LISTEN_ADDRESS" in your config.json!`
          );
      }
    );
  }

  routes() {
    if (!this.app || !this.settings || !this.guild) return;
    LOGGER.debug("Initializing routes");

    this.app.use(express.json({ limit: "10kb" }));
    this.app.use(express.urlencoded({ extended: true })); // support encoded bodies (required)

    this.app.use("/", AuthRoute(LOGGER, this.settings.DTTT_API_KEY));

    this.app.use("/id", IdRoute(LOGGER, this.guild));

    this.app.use("/mute", MuteRoute(LOGGER, this.guild));

    this.app.use("/deafen", DeafenRoute(LOGGER, this.guild));

    if (this.settings?.ENABLE_LEGACY_BACKEND) {
      LOGGER.info("Loading legacy routes");
      this.app.use("/legacy", LegacyRoutes(LOGGER, this.guild, VERSION));
    }
  }

  async initCommands() {
    if (!this.app || !this.settings) return;
    LOGGER.debug("Initializing commands");
    if (!this.settings.DISCORD_CLIENT_ID) {
      LOGGER.warn("No Discord client id provided, not adding commands...");
      return;
    }

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(this.settings.DISCORD_TOKEN);
    const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

    this.commands.forEach(async (cmd) => {
      LOGGER.debug("Loading command", cmd.name);
      body.push(cmd.data.toJSON());
    });

    try {
      LOGGER.info(
        `Started refreshing ${this.commands.size} application (/) commands.`
      );

      // The put method is used to fully refresh all commands in the guild with the current set
      const data = await rest.put(
        Routes.applicationGuildCommands(
          this.settings.DISCORD_CLIENT_ID,
          this.settings.GUILD_ID
        ),
        { body }
      );

      LOGGER.info(
        `Successfully reloaded ${
          (data as any).length || 0
        } application (/) commands.`
      );
    } catch (error) {
      // And of course, make sure you catch and log any errors!
      LOGGER.error(error, (error as any).requestBody.json);
    }
  }
}
