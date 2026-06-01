import { config } from "../config.js";

export interface HassAutomation {
  entityId: string;
  name: string;
  state: "on" | "off";
  lastTriggered: string | null;
}

export interface HassData {
  configured: boolean;
  automations: HassAutomation[];
}

let cache: { data: HassData; at: number } | null = null;
const CACHE_TTL = 30_000;

export async function getAutomations(): Promise<HassData> {
  if (!config.hass.configured) return { configured: false, automations: [] };

  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.data;

  const res = await fetch(`${config.hass.url}/api/states`, {
    headers: { Authorization: `Bearer ${config.hass.token}` },
  });
  if (!res.ok) throw new Error(`HA responded ${res.status}`);

  const states = (await res.json()) as Array<{
    entity_id: string;
    state: string;
    attributes: { friendly_name?: string; last_triggered?: string };
  }>;

  const automations: HassAutomation[] = states
    .filter((s) => s.entity_id.startsWith("automation."))
    .map((s) => ({
      entityId: s.entity_id,
      name: s.attributes.friendly_name ?? s.entity_id,
      state: s.state === "on" ? "on" : "off",
      lastTriggered: s.attributes.last_triggered ?? null,
    }));

  const data: HassData = { configured: true, automations };
  cache = { data, at: Date.now() };
  return data;
}

export async function toggleAutomation(entityId: string): Promise<void> {
  if (!config.hass.configured) throw new Error("Home Assistant not configured");

  const statesRes = await fetch(`${config.hass.url}/api/states/${entityId}`, {
    headers: { Authorization: `Bearer ${config.hass.token}` },
  });
  if (!statesRes.ok) throw new Error(`HA responded ${statesRes.status}`);
  const state = (await statesRes.json()) as { state: string };
  const service = state.state === "on" ? "turn_off" : "turn_on";

  const res = await fetch(`${config.hass.url}/api/services/automation/${service}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.hass.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId }),
  });
  if (!res.ok) throw new Error(`HA toggle failed ${res.status}`);

  // invalidate cache so next fetch reflects new state
  cache = null;
}
