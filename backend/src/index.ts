import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { apiRouter } from "./api/index.js";

const app = express();
app.use(cors());
app.use(express.json());

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
