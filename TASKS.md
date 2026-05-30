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

## Фаза 2 — Основные интеграции

- [ ] GitLab tasks (issues assigned + MRs) + локальные задачи (CRUD)
- [ ] Homelab services статус (ping/HTTP healthcheck, polling)
- [ ] Погода (Open-Meteo, текущая + 3 дня)

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
