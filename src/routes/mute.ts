import Logger from "@vertikarl/ts-logger";
import { Express, Router } from "express";
import { Guild } from "discord.js";
const router = Router();

export interface MuteRequest {
  id: string;
  status: boolean;
}

export default function MuteRoute(logger: Logger, guild: Guild) {
  router.post("/", async (req, res, next) => {
    let body: MuteRequest | MuteRequest[];
    try {
      body = req.body;
    } catch (err) {
      logger.error("Couldn't parse request!", err);
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
            logger.warn("Invalid request received");
            return;
          }
        }
        try {
          const member = await guild.members.fetch(id);
          await member.voice.setMute(
            status,
            status ? "dead players can't talk!" : undefined
          );
          logger.info(`[Success] Muted ${member.displayName}`);
        } catch (err) {
          res.status(500).end();
          logger.error("Couldn't resolve id", id);
          return;
        }
      } else {
        logger.error("Invalid request");
        res.status(400).end();
        return;
      }
    }
    res.status(200).json({ success: true }).end();
    return;
  });
  return router;
}
