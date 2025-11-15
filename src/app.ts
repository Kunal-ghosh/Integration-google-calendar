import cors from "cors";
import express from "express";
import path from "path";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFound";
import logger from "./lib/logger";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(__dirname, "../public")));

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandled_rejection");
});

process.on("uncaughtException", (error) => {
  logger.error({ error }, "uncaught_exception");
  process.exit(1);
});

export default app;

