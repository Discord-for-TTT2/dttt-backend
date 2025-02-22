import Logger from "@vertikarl/ts-logger";
import { Express, Router } from "express";
import { Guild } from "discord.js";
const router = Router();

export default function LegacyRoutes(
  logger: Logger,
  guild: Guild,
  version: string
) {
  router.get("/", async (req, res, next) => {
    logger.warn("Hitting legacy backend");
    let params: any | undefined;
    try {
      if (typeof req.headers.req !== "string") {
        res.status(400).end();
        logger.debug("Received invalid request");
        return;
      }
      if (typeof req.headers.params === "string") {
        params = JSON.parse(req.headers.params);
      }
    } catch (err) {
      res.status(500).end();
      logger.debug("Received invalid request", err);
      return;
    }

    logger.debug("REQUEST", req.headers.req);

    switch (req.headers.req) {
      case "connect": {
        if (!params.tag || typeof params.tag !== "string") {
          res.status(400).end();
          logger.error("no tag!");
          return;
        }

        const tag = (params.tag as String).toLowerCase();

        const found = guild.members.cache.find(
          (member) =>
            member.displayName === tag ||
            member.displayName
              .toLowerCase()
              .match(new RegExp(`.*${tag.toLowerCase()}.*`))
        );

        if (!found) {
          res.status(404).json({ answer: 0 });
          logger.error(
            "[LegacyConnect][Error]",
            `0 users found with tag "${tag}".`
          );
          return;
        } else {
          res.status(200).json({ tag: found.displayName, id: found.id });
          logger.info(
            "[LegacyConnect][Success]",
            `Connecting ${found.displayName} (${found.id})`
          );
          return;
        }
      }
      case "sync": {
        res.json({
          success: true,
          version,
          debugMode: logger.debug,
          discordGuild: guild.id,
        });
        logger.info("[LegacySync][Request]", params);
        return;
      }
      case "keep_alive": {
        res.json({ success: true });
        logger.info("[LegacyKeepAlive][Request]", params);
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
          logger.error(
            "[LegacyMute][Missing Params]",
            `id: "${id}" (${typeof id}), mute: "${mute}" (${typeof mute})`
          );
          return;
        }

        try {
          const member = await guild.members.fetch(id);
          await member.voice.setMute(
            mute,
            mute ? "dead players can't talk!" : undefined
          );
          res.status(200).json({ success: true });
          logger.info(
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
          logger.error(
            `[LegacyMute][Discord:SetMute][Error]`,
            `${mute ? "Mute" : "Unmute"}: ${id} - ${err}`
          );
        }
        break;
      }
    }
  });
  return router;
}
