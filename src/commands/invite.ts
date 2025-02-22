import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionsBitField,
  Role,
  SlashCommandBuilder,
  VoiceChannel,
} from "discord.js";
import Command, { CommandArguments } from "../Command";
import Logger from "@vertikarl/ts-logger";
import { promises as dns } from "dns";

function extend(builder: SlashCommandBuilder) {
  builder.addSubcommand((cmd) =>
    cmd
      .setName("send")
      .setDescription("Sends an invite to everyone with a specified role")
      .addChannelOption((option) => {
        return option
          .setName("channel")
          .setDescription("The voice channel to invite people to")
          .addChannelTypes([ChannelType.GuildVoice])
          .setRequired(true);
      })
      .addRoleOption((option) => {
        return option
          .setName("role")
          .setDescription(
            "Sets the role used for invites, (does not send out an invite on it's own)"
          )
          .setRequired(true);
      })
  );

  builder.addSubcommand((cmd) =>
    cmd
      .setName("change")
      .setDescription("Sets the added invite link")
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription(
            "The url to your WebServer that redirects to a steam connect url."
          )
          .setRequired(true)
      )
  );
}

interface InviteCommandSettings {
  inviteUrl: string;
}

export default class InviteCommand extends Command {
  settings: InviteCommandSettings = {
    inviteUrl: "",
  };
  permissions = [PermissionsBitField.Flags.Administrator];

  constructor() {
    super(
      "invite",
      `Lade alle Spieler mit der angegebenen Rolle zu TTT ein!`,
      extend
    );
  }

  async execute({ client, interaction, logger }: CommandArguments) {
    switch (interaction.options.getSubcommand()) {
      case "send":
        const role = interaction.options.getRole("role");
        const channel = interaction.options.getChannel("channel");

        if (!(role instanceof Role) || !(channel instanceof VoiceChannel)) {
          interaction.editReply(
            "Sorry but the provided role and/or channel are invalid!"
          );
          return;
        } else if (!this.settings.inviteUrl) {
          interaction.editReply(
            "Sorry but it seems like there is no invite url defined. Define one now with /invite change [url]"
          );
          return;
        } else {
          sendInvite(
            logger,
            interaction,
            role,
            channel,
            this.settings.inviteUrl
          );
        }
        break;
      case "change":
        const url = interaction.options.getString("url");
        if (!url) {
          interaction.editReply(
            "Sorry but that url does not seem to be valid!"
          );
          return;
        }
        this.settings.inviteUrl = url;
        interaction.editReply("Successfully changed the invite url to " + url);
        break;
    }
  }
}

async function sendInvite(
  logger: Logger,
  interaction: ChatInputCommandInteraction,
  role: Role,
  channel: VoiceChannel,
  inviteUrl: string
) {
  const { guild } = interaction;
  if (!guild) return;

  // Invite embed
  const inviteEmbed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle("Karl in Terrorist Town braucht dich!")
    .setDescription(
      `Spiel doch gerne mit! :)\nUm diese Nachricht nicht mehr zu bekommen verlasse die Gruppe @${role.name}`
    )
    .addFields(
      {
        name: "Link zum beitreten:",
        value: inviteUrl,
        inline: false,
      },
      {
        name: "Discord:",
        value: channel.url,
        inline: true,
      }
    )
    .setFooter({
      text: "TTT Server",
      iconURL: guild.iconURL() || "",
    });

  await interaction.guild?.members.fetch(); // cache all members first

  const collection = role.members.each(async (member) => {
    logger.debug("Member of role:", member.displayName);
    if (!member.nickname) return;
    try {
      const channel = await member.createDM();
      await channel.send({ embeds: [inviteEmbed] });
      logger.info("[InviteCommand]", "Sending invite to", member.nickname);
    } catch (err) {
      logger.warn(
        "[InviteCommand]",
        "Couldn't send invite to",
        member.nickname,
        err
      );
    }
  });

  if (collection.size > 0) {
    interaction.editReply(`Sent invite to ${collection.size} users!`);
  } else {
    interaction.editReply(`Found no users with role ${role.name}!`);
  }
}
