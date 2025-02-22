import Logger from "@vertikarl/ts-logger";
import bcrypt from "bcryptjs";
import { Express, Router } from "express";
const router = Router();

export default function AuthRoute(logger: Logger, apiKey: string) {
  router.use("/", async (req, res, next) => {
    logger.debug(`[${req.method}] ${req.path}`);
    logger.debug("[HEADERS]", req.headers);
    logger.debug("[BODY]", req.body);

    if (
      // check if the user is authenticated with either a plaintext DTTT API key or a hashed DTTT API key
      req.headers.authorization &&
      (req.headers.authorization === `Basic ${apiKey}` ||
        (await bcrypt.compare(
          req.headers.authorization.split("Basic ")[1],
          apiKey
        )))
    ) {
      next();
      return;
    }

    logger.info(
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

  return router;
}
