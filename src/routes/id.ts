import Logger from "@vertikarl/ts-logger";
import { Express, Router } from "express";
import { Guild } from "discord.js";
const router = Router();

export default function IdRoute(logger: Logger, guild: Guild) {
  router.get("/", (req, res, next) => {
    let { name, nick } = req.query;

    if (typeof name !== "string" || typeof nick !== "string") {
      res.status(400).end();
      logger.error("Invalid request, parameters missing.");
      return;
    }

    name = name.toLowerCase().trim();
    nick = nick.toLowerCase().trim();

    const member = guild.members.cache.find((member) => {
      const displayName = member.displayName.toLowerCase().trim();
      logger.debug(
        `Matching ${displayName}:${name}/${nick} ${
          displayName.includes(name) || displayName.includes(nick)
        }`
      );
      return displayName.includes(name) || displayName.includes(nick);
    });

    if (!member) {
      res.status(404).json({ answer: 0 }).end();
      logger.error(`0 users found with name "${name}" or nick ${nick}.`);
    } else {
      res
        .status(200)
        .json({
          name: member.displayName,
          nick: member.nickname,
          id: member.id,
        })
        .end();
      logger.info(
        `Success matched ${member.displayName} (${member.id}) to ${nick} (${name})`
      );
    }
  });

  return router;
}
