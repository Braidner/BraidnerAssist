import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { apiRouter } from "./api/index.js";

const app = express();
app.use(cors());
app.use(express.json());

// Опц. защита API bearer-токеном (MCP_TOKEN). В LAN всё равно сетевой порт.
app.use("/api", (req, res, next) => {
  if (!config.mcpToken) return next();
  const auth = req.header("authorization");
  if (auth === `Bearer ${config.mcpToken}`) return next();
  res.status(401).json({ error: "unauthorized" });
});

// Healthcheck (без авторизации — для docker/uptime).
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "mission-control-backend",
    integrations: {
      gitlab: config.gitlab.configured,
      homeAssistant: config.hass.configured,
      weather: config.weather.configured,
      caldav: config.caldav.configured,
    },
  });
});

app.use("/api", apiRouter);

app.listen(config.backendPort, () => {
  console.log(
    `[mission-control] backend listening on :${config.backendPort} (${config.nodeEnv})`,
  );
});
