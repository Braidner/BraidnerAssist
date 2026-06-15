# TASKS — Mission Control

Учёт работ по фазам. Обновляется по ходу разработки.

Легенда: `[ ]` todo · `[~]` в работе · `[x]` готово

---

## Фаза 1 — Скелет  ✅ ГОТОВО

- [x] Monorepo структура (frontend + backend)
  - [x] Корневые файлы: `.gitignore`, `.env.example`, `docker-compose.yml`
  - [x] `CLAUDE.md`, `TASKS.md`
  - [x] backend: package.json, tsconfig, Dockerfile, .dockerignore
  - [x] frontend: package.json, tsconfig, vite config, Dockerfile, nginx.conf
- [x] Docker Compose (написан; сборка контейнеров не гонялась — проверить при деплое)
- [x] База (Prisma + SQLite)
  - [x] schema.prisma: Task, AgentLog, AgentTask, AgentStatus, CalendarEvent
  - [x] миграция `20260530164247_init` + prisma generate
- [x] Базовый UI layout с пустыми виджетами
  - [x] Light/dark тема (prefers-color-scheme + ручной переключатель, localStorage)
  - [x] Grid layout, 7 widget-карточек заглушек
  - [x] Операционный NOC-стиль, моноширинные акценты, статус-цвета (зел/жёлт/красн)
- [x] Проверено: backend компилируется + smoke-тест CRUD задач; frontend собирается;
      dev-серверы стартуют, UI рендерится, `/healthz` проксируется (LINK OK)

> Уже работает сверх скелета: локальные задачи (CRUD), локальные события календаря,
> чтение статуса/лога Hermes и постановка команд в очередь — всё через Prisma.
> Остальные эндпоинты отдают `{ configured: false }` / `pending` до своих фаз.

## Деплой (hermes.lan) ✅ ГОТОВО

- [x] SSH-ключ настроен (braidner@hermes.lan, key-based)
- [x] Репо склонировано в ~/mission-control, .env создан с MCP_TOKEN
- [x] GitHub Actions: build-and-push → GHCR (публичные образы, triggered on push to main)
- [x] docker-compose.prod.yml: тянет образы из GHCR, никакой сборки на сервере
- [x] systemd oneshot-сервис `/etc/systemd/system/mission-control-deploy.service`
      — Hermes запускает `sudo systemctl start mission-control-deploy.service`
      — выполняет `docker compose pull && up -d` в фоне
- [x] Проверено: оба контейнера Up, /healthz OK, frontend HTTP 200

> Деплой: git push main → CI (~1 мин) → Hermes вызывает systemctl → обновление.

## Редизайн UI — Неоморфизм  ✅ ГОТОВО

- [x] Дизайн-система портирована из Claude Design бандла в `frontend/src/styles.css`
      (токены `--depth/--radius/--accent`, темы `.mc[data-theme]`, примитивы
      `.neu/.neu-in/.neu-sm`, шрифты Outfit + Inconsolata)
- [x] Компоненты: `Card`, `Ring`, `icons` + `panels/` (TopBar, StatStrip, Tasks,
      Habits, SystemStatus, Notes, HermesLog, Placeholder); удалён старый `Widget.tsx`
- [x] Раскладка C (three columns): полоса мини-статов + 3 колонки
- [x] Гибрид панелей: 5 панелей дизайна + плейсхолдеры Погода/HA/Календарь
- [x] Данные: Tasks + HermesLog — реальные (бэкенд), остальное — мок/плейсхолдеры
- [x] Тема dark/light, дефолт dark, акцент `#34d399`
- [x] Проверено: `npm run build` ok; dev-сервер + браузер (обе темы, тоггл задач
      шлёт PUT и персистит, реальный лог Hermes, плейсхолдеры рендерятся)

> Tweaks-панель (слайдеры глубины/радиуса/выбор акцента) — вне скоупа, значения
> зафиксированы на «приземлённых» в дизайне (depth .8, radius 19, accent #34d399).

## Фаза 2 — Основные интеграции  ✅ ГОТОВО

- [x] GitLab tasks (issues assigned + MRs) + локальные задачи (CRUD)
      — бэкенд: `integrations/gitlab.ts`, кеш POLL_TASKS; задачи мёрджатся в `GET /api/tasks`
      — фронтенд: кнопка «+» в панели Tasks, `createTask()` → `POST /api/tasks`
      — GitLab-задачи read-only (toggle игнорируется), помечены тегом `gitlab`
- [x] Homelab services статус (ping/HTTP healthcheck, polling)
      — бэкенд: `integrations/services.ts`; читает `/data/services.json`, кеш POLL_SERVICES
      — фронтенд: `SystemStatusPanel` получает реальные сервисы, при `!configured` — мок
      — конфиг: `SERVICES_FILE=/data/services.json`; формат: `[{name,url},...]`
- [x] Погода (Open-Meteo, текущая + 3 дня)
      — бэкенд: `integrations/weather.ts`; без API-ключа, кеш POLL_WEATHER
      — фронтенд: `WeatherPanel` (current temp/desc/wind + 3 forecast tiles)
      — при `!configured` (нет WEATHER_LAT/LON) → карточка с инструкцией

> Проверено: `npm run build` ok; dev-сервер + браузер (задача создана через «+» и
> персистилась, Weather «not configured» рендерится, SystemStatus mock-fallback ok).

## Фаза 2 — Доработки UI и UX  ✅ ГОТОВО

- [x] GitLab drawer — клик на задачу открывает slide-in панель с деталями
      (kind badge, project ref, labels, branch, due date, описание, ссылка в GitLab)
- [x] SHA-версия в TopBar — `APP_VERSION` build-arg в Dockerfile, CI прокидывает `${{ github.sha }}`;
      `version.ts` читает из env и возвращает `sha`; TopBar показывает `v0.1.0 <sha>`
- [x] Viewport-lock раскладка — Tasks в левой колонке растягивается на 100% высоты экрана,
      внутри — scroll; `col-fill` CSS-класс для height-fill колонок
- [x] StatStrip overhaul — 4 тайла: задачи | сервисы | погода (сегодня/завтра/послезавтра) | шаги
- [x] Удалены панели: Habits, Notes, WeatherPanel, Calendar — не используются
- [x] Финальная раскладка: кол.1=Tasks, кол.2=SystemStatus+Health+HA, кол.3=HermesLog

## Фаза 3 — UI/UX improvements  ✅ ГОТОВО

- [x] Calendar — удалён полностью (пользователь не использует)
- [x] Health integration — удалена (деferred); HealthDay миграция создана и откачена
- [x] APP_TOKEN — статический bearer-токен для iOS Shortcuts / Hermes (не истекает)
      добавлен в `jwtAuth.ts`, `config.ts`, `.env.example`
- [x] StatStrip carousel — на ≤760px: scroll-snap, свайп, dots-индикаторы;
      4й тайл переключён с шагов на HA automations count
- [x] Version pill — при наличии апдейта показывает `v0.1.0 → v0.2.0` с amber glow

## Фаза 4 — Home Assistant  ✅ ГОТОВО

- [x] `backend/src/integrations/homeassistant.ts` — `getAutomations()` (30с кеш),
      `toggleAutomation(entityId)` (читает состояние → turn_on/turn_off)
- [x] `GET /api/homeassistant/automations` — список автоматизаций с state/lastTriggered
- [x] `POST /api/homeassistant/automations/toggle` — toggle по entityId в body
- [x] `HomeAssistantPanel` — список с click-to-toggle строками; Placeholder при !configured
- [x] StatStrip 4й тайл: `active/total` автоматизаций
- [x] Деплой: HASS_URL=http://homeassistant.lan:8123, HASS_TOKEN настроен на сервере
- [x] Проверено: 8 автоматизаций тянутся из HA, toggle работает

## Фаза 5 — MCP сервер + Hermes  ✅ ГОТОВО

- [x] `@modelcontextprotocol/sdk@1.29.0` + `zod@4.4.3` установлены
- [x] `backend/src/mcp/server.ts` — `createMcpServer()` (новый экземпляр на сессию)
- [x] MCP tools (12 штук):
      — tasks: `get_tasks`, `create_task`, `update_task`, `complete_task`
      — agent: `report_status`, `log_action`, `get_agent_queue`, `complete_agent_task`
      — ha: `get_automations`, `toggle_automation`
      — infra: `get_services`, `get_weather`
- [x] Streamable HTTP транспорт: `POST/GET/DELETE /mcp`, bearer `MCP_TOKEN`, Origin-guard
      (защита от DNS-rebinding: localhost / .lan / .local)
- [x] Проверено: `tools/list` возвращает все 12 инструментов; сессия инициализируется
- [x] Деплой: образ обновлён в GHCR, на hermes.lan перезапущен и проверен

## Фаза 6 — Polish  ✅ ГОТОВО

- [x] PWA (vite-plugin-pwa: manifest + service worker, иконки, установка на телефон)
- [x] Настройки из UI (Settings modal ⚙ в TopBar — редактор списка сервисов вместо ручного services.json)
- [ ] Drag-and-drop виджетов (react-grid-layout, persist order) — отложено

## Proxmox + StatStrip rework (2026-06-03)  ✅ ГОТОВО

- [x] `backend/src/integrations/proxmox.ts` — `getProxmox()` (кеш POLL_PROXMOX 30с);
      undici `Agent` с `rejectUnauthorized:false` для self-signed TLS; заголовок
      `Authorization: PVEAPIToken=user@realm!id=secret`; авто-определение online-нода
- [x] Конфиг-блок `proxmox` в `config.ts` (PROXMOX_URL/TOKEN/NODE), `.env.example` секция
- [x] `GET /api/proxmox` — node + resource (cpu/ram/disk) + vms (qemu+lxc, cpu/ram, статус)
- [x] Фронт: типы + `getProxmox()` в `lib/api.ts`
- [x] StatStrip переработан в ОДНУ горизонтальную полосу мини-тайлов: погода (wide) +
      один объединённый Proxmox-тайл (CPU/RAM/DISK гейджи в ряд, диск/RAM в ГБ) +
      по тайлу на VM/LXC + по тайлу на сервис; точки-индикаторы убраны; неоморфные тени
      не обрезаются (padding/отрицательный margin на `.stat-strip`)
- [x] Панель `SystemStatus` удалена; средняя колонка = только HomeAssistant
- [x] Деплой: PROXMOX_URL=https://192.168.1.90:8006, token id `root@pam!dash` на сервере
- [x] Проверено: `npm run build` (front+back) ok; реальные данные Proxmox в превью

## Hermes command queue + deep pages (2026-06-13, commit 782ba2d)  ✅ ГОТОВО

- [x] P1 — командная очередь Hermes замкнута end-to-end: `GET /api/hermes/commands`,
      `sendHermesCommand`/`getHermesCommands` в `lib/api.ts`, кнопка «Передать Hermes» в Drawer
- [x] P2 — `/hermes` deep-страница (`HermesPage.tsx`): статус-шапка + глобальный фид + командная консоль
- [x] P3 — `/tasks` и `/home-assistant` full-width из готовых панелей
- [x] P4 — `/system` deep-страница (`SystemPage.tsx`): Proxmox-гейджи + VM/LXC + таблица сервисов
- [x] Доки: память синхронизирована — Hermes на main = локальная MCP→SQLite модель (НЕ Nous session API)

## Batch v2 — Docker + uptime + ntfy (2026-06-14, commit 2b1bbc1)  ✅ ГОТОВО

- [x] #2 История аптайма → `/metrics`: модель `ServiceCheck` (+миграция `service_check`),
      сэмплер `backend/src/sampler.ts` (запись пингов в SQLite, прунинг >7 дней),
      `GET /api/metrics/uptime` (uptime 24ч/7д + спарклайн), `MetricsPage.tsx` (заменил StubPage)
- [x] #1 Docker-контроль на `/system`: `integrations/docker.ts` (undici unix-socket, opt-in
      `DOCKER_SOCKET`), `GET /api/docker/containers` + `POST /api/docker/containers/:id/:action`
      (whitelist start|stop|restart), MCP-инструмент `restart_container`, Docker-карточка в SystemPage
- [x] #10 Нотификации Hermes: `integrations/notify.ts` (ntfy, opt-in `NTFY_URL`); хук в MCP
      `report_status` — пуш при переходе агента в `error`; no-op при незаданном env
- [x] compose: закомментированное opt-in монтирование docker.sock с пометкой о безопасности
- [x] Деплой: миграция `service_check` применена на hermes.lan; backend healthz 200,
      `/api/metrics/uptime` 401 (роут жив), frontend :3000 → 200
- [x] Включить opt-in на сервере: `DOCKER_SOCKET` + rw-монтирование сокета (commit ece177c).
      `NTFY_URL` — пропущен по решению пользователя.

## Batch v3 — Homelab-стек + AdGuard + Media + Cmd-K (commit 472ada5, задеплоено)

- [x] Развёрнут homelab-стек на hermes.lan: новый 1ТБ диск → `/srv/stack`, собственный
      `docker-compose.yml` (AdGuard, Jellyfin, Sonarr, Radarr, Prowlarr, qBittorrent; не в репо)
- [x] #6 AdGuard DNS: `integrations/adguard.ts` (basic auth `/control/stats`), `GET /api/adguard`,
      карточка на `/system`. Env `ADGUARD_URL`/`ADGUARD_USER`/`ADGUARD_PASSWORD`
- [x] #7 Медиа: `integrations/media.ts` (Jellyfin now-playing + Sonarr/Radarr/qBittorrent очередь
      через `Promise.allSettled`), `GET /api/media`, `MediaPage.tsx` на `/media` + пункт Sidebar
- [x] #4 Cmd-K: `CommandPalette.tsx` — переход между страницами + отправка команды Hermes
- [x] Деплой: все 4 источника достижимы+авторизованы из backend-контейнера; REST-роуты 401-guarded;
      frontend :3000 → 200. AdGuard статистика = 0 пока DNS клиентов не направят на 192.168.2.184

---

## Batch v4 — Media++ (плеер + торренты + Prowlarr)

- [x] Backend `media.ts`: библиотека (`getLibrary`), HLS-путь (`getPlaybackPath` — пустые
      DirectPlayProfiles форсят транскод), реверс-прокси (`jellyfinProxy`), скан (`jellyfinRefresh`),
      `qbAdd`/`qbAction` (pause|resume|delete), `prowlarrSearch`; enriched `DownloadItem`
- [x] Backend `config.ts`: блок `media.prowlarr` (`PROWLARR_URL`/`PROWLARR_API_KEY`)
- [x] Backend `adguard.ts`: `setAdguardProtection` (`POST /control/protection`)
- [x] REST `api/index.ts`: `ALL /media/jellyfin/*` (прокси + переписывание `.m3u8`), `/media/library`,
      `/media/play/:id`, `/media/scan`, `/media/search`, `POST /media/torrent`,
      `POST /media/torrent/:hash/:action`, `POST /adguard/protection`
- [x] MCP: `add_torrent`, `get_media_status`, `get_dns_stats` + INSTRUCTIONS
- [x] Frontend: `hls.js`, новые api-функции, `MediaPage.tsx` (грид библиотеки → HLS-плеер,
      magnet-инпут, Prowlarr-поиск, управление очередью), Cmd-K действия (рестарт/DNS/задача)
- [x] Деплой на hermes.lan + `PROWLARR_*` в server `.env`; верификация: healthz 200, новые роуты
      401-guarded, Prowlarr 200 из backend-контейнера, Jellyfin /Items 200 (библиотека пуста —
      контента ещё нет), frontend :3000 → 200, backend стартовал чисто

---

## Batch v5 — *arr пайплайн в медиатеку + UI pass (2026-06-15)

Проблема: скачанные торренты не попадают в Jellyfin. Корень — у Jellyfin было 0 библиотек,
а торренты падали в `/data/downloads` без импорта. Решение — правильный homelab-пайплайн.

- [x] Сервер (homelab-стек, НЕ репо): Radarr root `/data/movies` + qB client (cat radarr);
      Sonarr root `/data/tv` + qB (cat sonarr); Prowlarr Applications → Radarr/Sonarr (indexer
      sync); Jellyfin Movies(`/media/movies`)+Shows(`/media/tv`)
- [x] Пайплайн проверен e2e: Tetris 2023 → Radarr ManualImport (hardlink) `/data/movies` →
      скан Jellyfin → фильм в библиотеке
- [x] Backend `media.ts`: `arrLookup(kind,term)` + `arrAdd(kind,id)` (первый rootfolder+
      qualityprofile, lookup по tmdb:/tvdb:, POST full object + searchForMovie/MissingEpisodes)
- [x] REST: `GET /media/lookup?type=&q=`, `POST /media/add {type,id}`
- [x] MCP: `add_movie({query})` / `add_series({query})` (lookup→add топ) + INSTRUCTIONS (prefer over add_torrent)
- [x] Frontend: `lookupTitle`/`addTitle` (api.ts); AddTorrentDrawer «Добавить в медиатеку» —
      сегмент Фильм/Сериал → поиск → постер/«Добавить»; magnet+Prowlarr в свёрнутом «Вручную».
      CSS `.seg`/`.lk-*`/`.add-toggle`. tsc + vite build чистые
- [x] UI pass (задеплоен ранее этой сессией): убран дубль-логотип, единые `.btn*`, неоморфизм
      вложенных карточек, цветовые токены тем
- [x] Деплой образов на hermes.lan (commit 87256df, env RADARR_*/SONARR_* уже заданы); верификация:
      healthz 200, frontend 200, `/media/lookup`+`/media/add` 401-guarded, чистый старт; авторизованный
      `/media/lookup?type=movie&q=tetris` → 8 результатов с постерами, Tetris 2023 `added:true`

---

## REST API (план)

```
GET/POST/PUT/DEL  /api/tasks[/:id]
GET   /api/health/summary       POST /api/health/import
GET   /api/services
GET   /api/proxmox
GET   /api/homeassistant/automations
POST  /api/homeassistant/automations/:id/toggle
POST  /api/homeassistant/scripts/:id/trigger
GET/POST  /api/calendar/events
GET   /api/weather
GET   /api/hermes/sessions       POST /api/hermes/session
GET   /api/hermes/sessions/:id   POST /api/hermes/sessions/:id/chat
```

## Заметки / решения

- DATABASE_URL=`file:/data/mission-control.db` — в смонтированном volume `./data`.
- Каждая интеграция проверяет наличие env; иначе статус `not_configured`.
