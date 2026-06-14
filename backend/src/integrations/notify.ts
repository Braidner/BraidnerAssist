// Нотификации через ntfy (https://ntfy.sh).
// Изоляция: если NTFY_URL не задан — no-op, ошибки не роняют вызывающий код.

import { config } from "../config.js";
import { log } from "../logger.js";

export async function notify(title: string, message: string, priority?: string): Promise<void> {
  if (!config.notify.configured || !config.notify.ntfyUrl) return;
  try {
    await fetch(config.notify.ntfyUrl, {
      method: "POST",
      headers: {
        Title: title,
        Priority: priority ?? "default",
        "Content-Type": "text/plain",
      },
      body: message,
    });
  } catch (err) {
    log.warn("notify", "Ошибка отправки уведомления ntfy", String(err));
  }
}
