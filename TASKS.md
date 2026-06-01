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

## Фаза 6 — Polish  ← В РАБОТЕ

- [ ] PWA (manifest + service worker — офлайн, иконка, установка на телефон)
- [ ] Настройки из UI (редактор списка сервисов вместо ручного services.json)
- [ ] Drag-and-drop виджетов (react-grid-layout, persist order)

---

## REST API (план)

```
GET/POST/PUT/DEL  /api/tasks[/:id]
GET   /api/health/summary       POST /api/health/import
GET   /api/services
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
