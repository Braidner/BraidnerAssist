import { expect, test } from "@playwright/test";

test("renders the Mission Control auth shell", async ({ page }) => {
  await page.route("**/api/auth/setup-status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ setupRequired: false }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("Mission Control")).toBeVisible();
  await expect(page.getByPlaceholder("username")).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Войти|Создать администратора/ }),
  ).toBeVisible();
});

test("registers a user into the approval queue", async ({ page }) => {
  await page.route("**/api/auth/setup-status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ setupRequired: false }),
    });
  });
  await page.route("**/api/auth/register", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        status: "pending",
        user: { id: "pending-1", username: "viewer", displayName: "Viewer" },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Логин").fill("viewer");
  await page.getByLabel("Имя").fill("Viewer");
  await page.getByLabel("Пароль", { exact: true }).fill("viewer-secret");
  await page.getByLabel("Повтор пароля").fill("viewer-secret");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();

  await expect(page.getByRole("heading", { name: "Регистрация отправлена" })).toBeVisible();
  await expect(page.getByText(/Администратор должен подтвердить/)).toBeVisible();
});

test("admin approves a pending user and assigns a role", async ({ page }) => {
  let approved = false;
  let approvedRole = "";

  await page.addInitScript(() => {
    window.localStorage.setItem("mc-auth-token", "test-token");
  });
  await page.route("**/healthz", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await page.route("**/api/version", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: "test" }) }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ id: "admin-1", username: "owner", role: "admin" }),
    }),
  );
  await page.route("**/api/settings/jellyfin-users", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/docker/containers", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: false, containers: [] }),
    }),
  );
  await page.route("**/api/adguard", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: false }),
    }),
  );
  await page.route("**/api/tasks", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/media/quota", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: false,
        userId: "admin-1",
        periods: [],
        available: null,
        blockingPeriod: null,
        updatedAt: "2026-07-25T12:00:00.000Z",
      }),
    }),
  );
  await page.route("**/api/settings/users**", async (route) => {
    if (route.request().url().endsWith("/approve")) {
      approvedRole = ((await route.request().postDataJSON()) as { role: string }).role;
      approved = true;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "pending-1",
          username: "viewer",
          displayName: "Viewer",
          role: approvedRole,
          approvalStatus: "approved",
          jellyfinUserId: null,
          jellyfinAuthStatus: "not_linked",
          active: true,
          createdAt: "2026-07-24T10:00:00.000Z",
          updatedAt: "2026-07-24T10:00:00.000Z",
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        approved
          ? []
          : [
              {
                id: "pending-1",
                username: "viewer",
                displayName: "Viewer",
                role: "media",
                approvalStatus: "pending",
                jellyfinUserId: null,
                jellyfinAuthStatus: "not_linked",
                active: true,
                createdAt: "2026-07-24T10:00:00.000Z",
                updatedAt: "2026-07-24T10:00:00.000Z",
              },
            ],
      ),
    });
  });

  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /Доступно загрузок/ })).toHaveCount(0);
  await expect(page.getByText("Ожидают подтверждения")).toBeVisible();
  await expect(page.getByText("@viewer")).toBeVisible();

  await page.getByLabel("Роль после подтверждения").click();
  await page.getByRole("option", { name: "Админ" }).click();
  await page.getByRole("button", { name: "Подтвердить" }).click();

  await expect.poll(() => approvedRole).toBe("admin");
  await expect(page.getByText("Новых заявок нет")).toBeVisible();
});

test("admin sees live Jellyfin activity and recent viewing history", async ({ page }) => {
  let resetPeriod = "";
  let savedWeeklyLimit: number | null = null;
  await page.addInitScript(() => {
    window.localStorage.setItem("mc-auth-token", "test-token");
  });
  await page.route("**/healthz", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await page.route("**/api/version", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: "test" }) }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ id: "admin-1", username: "owner", role: "admin" }),
    }),
  );
  await page.route("**/api/docker/containers", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: false, containers: [] }),
    }),
  );
  await page.route("**/api/adguard", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: false }),
    }),
  );
  await page.route("**/api/tasks", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/media/quota", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        userId: "admin-1",
        periods: [
          {
            key: "daily",
            label: "Сегодня",
            limit: 5,
            used: 2,
            remaining: 3,
            percent: 40,
            resetsAt: "2026-07-25T21:00:00.000Z",
          },
          {
            key: "weekly",
            label: "Эта неделя",
            limit: 12,
            used: 4,
            remaining: 8,
            percent: 33,
            resetsAt: "2026-07-26T21:00:00.000Z",
          },
        ],
        available: 3,
        blockingPeriod: null,
        updatedAt: "2026-07-25T12:00:00.000Z",
      }),
    }),
  );
  await page.route("**/api/settings/jellyfin-users", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/settings/users", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "admin-1",
          username: "owner",
          displayName: "Алексей",
          role: "admin",
          approvalStatus: "approved",
          jellyfinUserId: "jf-admin",
          jellyfinAuthStatus: "token_ok",
          downloadLimitTotal: null,
          downloadLimitDaily: 5,
          downloadLimitWeekly: 12,
          active: true,
          createdAt: "2026-07-01T12:00:00.000Z",
          updatedAt: "2026-07-25T12:00:00.000Z",
        },
      ]),
    }),
  );
  await page.route("**/api/settings/users/activity", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        updatedAt: "2026-07-24T12:30:45.000Z",
        summary: { users: 2, online: 1, watching: 1, liveBitrate: 8_000_000 },
        users: [
          {
            id: "app:admin-1",
            appUserId: "admin-1",
            jellyfinUserId: "jf-admin",
            username: "owner",
            displayName: "Алексей",
            role: "admin",
            linked: true,
            online: true,
            lastSeenAt: "2026-07-24T12:30:40.000Z",
            liveBitrate: 8_000_000,
            devices: [{ name: "Apple TV", client: "Jellyfin tvOS" }],
            nowPlaying: [
              {
                sessionId: "session-1",
                name: "Знакомство",
                seriesName: "Разделение",
                itemType: "Episode",
                imageItemId: "series-1",
                seasonNumber: 1,
                episodeNumber: 1,
                progressPct: 42,
                paused: false,
                deviceName: "Apple TV",
                client: "Jellyfin tvOS",
                playMethod: "DirectPlay",
                resolution: "3840×2160",
                bitrate: 8_000_000,
              },
            ],
            history: [
              {
                id: "episode-1",
                name: "Хорошие новости об аде",
                seriesName: "Разделение",
                itemType: "Episode",
                imageItemId: "series-1",
                seasonNumber: 1,
                episodeNumber: 1,
                playedAt: "2026-07-23T20:15:00.000Z",
                progressPct: 100,
                played: true,
                playCount: 1,
              },
            ],
            quota: {
              configured: true,
              userId: "admin-1",
              periods: [
                {
                  key: "daily",
                  label: "Сегодня",
                  limit: 5,
                  used: 2,
                  remaining: 3,
                  percent: 40,
                  resetsAt: "2026-07-25T21:00:00.000Z",
                },
                {
                  key: "weekly",
                  label: "Эта неделя",
                  limit: 12,
                  used: 4,
                  remaining: 8,
                  percent: 33,
                  resetsAt: "2026-07-26T21:00:00.000Z",
                },
              ],
              available: 3,
              blockingPeriod: null,
              updatedAt: "2026-07-25T12:00:00.000Z",
            },
          },
          {
            id: "jellyfin:guest",
            appUserId: null,
            jellyfinUserId: "guest",
            username: "guest",
            displayName: "Гость",
            role: null,
            linked: false,
            online: false,
            lastSeenAt: null,
            liveBitrate: 0,
            devices: [],
            nowPlaying: [],
            history: [],
            quota: null,
          },
        ],
      }),
    }),
  );
  await page.route("**/api/settings/users/admin-1/download-limits/daily/reset", async (route) => {
    resetPeriod = "daily";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        userId: "admin-1",
        periods: [],
        available: null,
        blockingPeriod: null,
        updatedAt: "2026-07-25T12:00:00.000Z",
      }),
    });
  });
  await page.route("**/api/settings/users/admin-1/download-limits", async (route) => {
    const body = (await route.request().postDataJSON()) as { weekly: number | null };
    savedWeeklyLimit = body.weekly;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        userId: "admin-1",
        periods: [],
        available: null,
        blockingPeriod: null,
        updatedAt: "2026-07-25T12:00:00.000Z",
      }),
    });
  });

  await page.goto("/settings");

  await expect(page.getByText("Активность Jellyfin")).toBeVisible();
  await expect(page.getByText("8 Мбит/с").first()).toBeVisible();
  await expect(page.getByText("Смотрит сейчас")).toBeVisible();
  await expect(page.getByText("Разделение").first()).toBeVisible();
  await expect(page.getByText("Apple TV · Jellyfin tvOS")).toBeVisible();
  await expect(page.getByText("только Jellyfin")).toBeVisible();
  await expect(page.getByText("3 загрузок доступно")).toBeVisible();

  await page.getByRole("button", { name: /Недавние просмотры/ }).first().click();
  await expect(page.getByText("S01E01 · Хорошие новости об аде")).toBeVisible();
  await expect(page.getByText("просмотрено")).toBeVisible();

  await page.getByRole("button", { name: "Управление" }).click();
  await expect(page.getByText("Лимиты загрузок")).toBeVisible();
  await expect(page.getByText("2 из 5")).toBeVisible();
  await page.getByRole("button", { name: "Сбросить дневной счётчик" }).click();
  await expect.poll(() => resetPeriod).toBe("daily");
  await page.getByRole("spinbutton", { name: "Недельный лимит" }).fill("15");
  await page.getByRole("button", { name: "Сохранить лимиты" }).click();
  await expect.poll(() => savedWeeklyLimit).toBe(15);

  await page.getByRole("button", { name: /Доступно загрузок: 3/ }).click();
  await expect(page.getByText("Считаются добавленные торренты")).toBeVisible();
  await expect(page.getByText("2 / 5 · 40%")).toBeVisible();
});
