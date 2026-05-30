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

## Фаза 3 — Health + Calendar

- [ ] Apple Health XML парсер (`/api/health/import`, авто-парс из папки)
- [ ] Календарь (CalDAV или локальный + iCal импорт)

## Фаза 4 — Home Assistant

- [ ] Автоматизации (list/toggle), скрипты (trigger)
- [ ] WebSocket для real-time обновлений

## Фаза 5 — Hermes Integration

- [ ] MCP сервер (stdio + Streamable HTTP, bearer + Origin-валидация)
- [ ] MCP tools: get_tasks/create_task/update_task/complete_task,
      report_status/log_action/get_agent_queue, get_automations/toggle_automation/
      trigger_script, get_services_status, get_health_summary/get_today_events
- [ ] Agent monitor виджет (статус, лог, очередь)
- [ ] Очередь команд (POST /api/hermes/command)

## Фаза 6 — Polish

- [ ] Drag-and-drop виджетов (react-grid-layout)
- [ ] Настройки (конфиг сервисов из UI)
- [ ] PWA (доступ с телефона в сети)

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
GET   /api/hermes/status         GET /api/hermes/log    POST /api/hermes/command
```

## Заметки / решения

- DATABASE_URL=`file:/data/mission-control.db` — в смонтированном volume `./data`.
- Каждая интеграция проверяет наличие env; иначе статус `not_configured`.
