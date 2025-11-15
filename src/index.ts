import "dotenv/config";
import app from "./app";
import env from "./config/env";
import logger from "./lib/logger";
import prisma from "./lib/prisma";

const port = env.PORT;

const server = app.listen(port, () => {
  logger.info(`Server ready on http://localhost:${port}`);
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, "graceful_shutdown_initiated");
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "error_closing_http_server");
      process.exit(1);
    }
    await prisma.$disconnect();
    process.exit(0);
  });
};

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => void shutdown(signal));
});

