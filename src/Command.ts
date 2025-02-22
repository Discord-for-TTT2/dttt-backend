import Logger from "@vertikarl/ts-logger";
import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
} from "discord.js";

export interface CommandArguments {
  client: Client;
  interaction: ChatInputCommandInteraction;
  logger: Logger;
  serverAddress?: string;
  serverPort?: number;
}

export default abstract class Command {
  data: SlashCommandBuilder;
  settings?: any;
  permissions: bigint[] = [];

  constructor(
    public name: string,
    public description: string,
    extend?: Function
  ) {
    this.data = new SlashCommandBuilder()
      .setName(this.name)
      .setDescription(this.description);
    if (extend) {
      console.debug("Extending");
      extend(this.data);
    }
  }
  abstract execute(args: CommandArguments): Promise<void>;
}
