import { expect, test, type Page } from "@playwright/test";

const seriesDetail = {
  jellyfinId: "series-1",
  title: "Тестовый сериал",
  year: 2026,
  overview: "Описание сериала",
  genres: ["Драма"],
  network: null,
  status: "Returning Series",
  runtime: 25,
  rating: 8.2,
  posterRemote: null,
  backdropRemote: null,
  tmdbId: 101,
  tvdbId: 202,
  inLibrary: true,
  seasons: [
    {
      seasonNumber: 1,
      fileCount: 2,
      totalCount: 2,
      monitored: false,
      episodes: [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          title: "Первая серия",
          airDate: "2026-07-01",
          hasFile: true,
          quality: "1080p",
          size: 1_000,
          stillRemote: null,
          jellyfinId: "episode-1",
          played: false,
        },
        {
          seasonNumber: 1,
          episodeNumber: 2,
          title: "Вторая серия",
          airDate: "2026-07-08",
          hasFile: true,
          quality: "1080p",
          size: 1_000,
          stillRemote: null,
          jellyfinId: "episode-2",
          played: false,
        },
      ],
    },
  ],
};

async function mockAuthenticatedMedia(
  page: Page,
  resumeAfterDetail: boolean,
  detail = seriesDetail,
) {
  let detailOpened = false;

  await page.addInitScript(() => {
    window.localStorage.setItem("mc-auth-token", "test-token");
  });
  await page.route("**/healthz", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/auth/me") {
      return json({ id: "user-1", username: "viewer", role: "media" });
    }
    if (path === "/api/version") return json({ version: "test" });
    if (path === "/api/media") {
      return json({ configured: true, torrserver: false, tmdb: false, nowPlaying: [], downloads: [] });
    }
    if (path === "/api/media/library") {
      return json([
        {
          id: "series-1",
          name: "Тестовый сериал",
          type: "Series",
          year: 2026,
          rating: 8.2,
          tmdbId: 101,
          tvdbId: 202,
          childCount: 1,
          played: false,
          unplayed: 2,
        },
      ]);
    }
    if (path === "/api/media/detail/series/series-1" || path === "/api/media/title/series/101") {
      detailOpened = true;
      return json(detail);
    }
    if (path === "/api/media/continue") {
      return json(
        resumeAfterDetail && detailOpened
          ? [
              {
                id: "episode-1",
                title: "Тестовый сериал — Первая серия",
                kind: "episode",
                positionPct: 37,
                year: 2026,
                seriesId: "series-1",
              },
            ]
          : [],
      );
    }
    if (path === "/api/media/home") return json({ hero: null });
    if (path === "/api/media/play/episode-1") {
      return json({
        url: "/api/media/jellyfin/test-stream.m3u8",
        playSessionId: "play-session-1",
        mediaSourceId: "episode-1",
        linked: true,
      });
    }
    if (path === "/api/media/discover/rails") {
      return json({ configured: false, hero: null, genres: { movie: [], series: [] }, rails: [] });
    }
    if (path === "/api/media/quota") {
      return json({
        configured: false,
        userId: "user-1",
        periods: [],
        available: null,
        blockingPeriod: null,
        updatedAt: "2026-07-30T12:00:00.000Z",
      });
    }
    if (
      path === "/api/media/torrent-rail" ||
      path === "/api/media/pending-titles" ||
      path === "/api/media/statuses" ||
      path === "/api/media/preferences" ||
      path === "/api/tasks"
    ) {
      return json([]);
    }
    if (path === "/api/docker/containers") return json({ configured: false, containers: [] });
    if (path === "/api/adguard") return json({ configured: false });
    return json([]);
  });
}

test("refreshes continue watching after returning from a series", async ({ page }) => {
  await mockAuthenticatedMedia(page, true);
  await page.goto("/media");

  await expect(page.getByText("ПРОДОЛЖИТЬ ПРОСМОТР")).toHaveCount(0);
  await page.getByText("Тестовый сериал", { exact: true }).last().click();
  await expect(page).toHaveURL(/\/media\/series\/101$/);
  await page.goBack();

  await expect(page.getByText("Тестовый сериал — Первая серия")).toBeVisible();
  await expect(page.getByText("37% просмотрено")).toBeVisible();
});

test("marks watched episodes in the season rail", async ({ page }) => {
  const watchedDetail = {
    ...seriesDetail,
    seasons: seriesDetail.seasons.map((season) => ({
      ...season,
      episodes: season.episodes.map((episode, index) => ({
        ...episode,
        played: index === 0,
      })),
    })),
  };
  await mockAuthenticatedMedia(page, false, watchedDetail);
  await page.goto("/media/series/101");

  const watchedEpisode = page.getByRole("article", { name: /S01E01.*Первая серия/ });
  await expect(watchedEpisode.getByText("Просмотрено")).toBeVisible();
  await expect(page.getByRole("article", { name: /S01E02.*Вторая серия/ }).getByText("Просмотрено")).toHaveCount(0);
});

test("shows buffered video separately from playback progress", async ({ page }) => {
  await mockAuthenticatedMedia(page, false);
  await page.goto("/media/series/101");
  await page.getByTitle("Воспроизвести").first().click();

  const video = page.locator("video");
  await expect(video).toBeVisible();
  await video.evaluate((element) => {
    Object.defineProperties(element, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, value: 20, writable: true },
      buffered: {
        configurable: true,
        value: {
          length: 1,
          start: () => 0,
          end: () => 65,
        },
      },
    });
    element.dispatchEvent(new Event("durationchange"));
    element.dispatchEvent(new Event("timeupdate"));
    element.dispatchEvent(new Event("progress"));
  });

  await expect(page.getByTestId("player-buffered")).toHaveAttribute("style", /width: 65%/);
  await expect(page.getByTestId("player-progress")).toHaveAttribute("style", /width: 20%/);
});
