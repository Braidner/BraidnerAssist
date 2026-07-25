import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDownloadQuotaSnapshot,
  nextMoscowMidnight,
  nextMoscowWeek,
  startOfMoscowDay,
  startOfMoscowWeek,
} from "../src/integrations/downloadQuota.js";

test("download quota periods use Moscow midnight and Monday boundaries", () => {
  const now = new Date("2026-07-25T20:30:00.000Z"); // Sat 23:30 MSK

  assert.equal(startOfMoscowDay(now).toISOString(), "2026-07-24T21:00:00.000Z");
  assert.equal(nextMoscowMidnight(now).toISOString(), "2026-07-25T21:00:00.000Z");
  assert.equal(startOfMoscowWeek(now).toISOString(), "2026-07-19T21:00:00.000Z");
  assert.equal(nextMoscowWeek(now).toISOString(), "2026-07-26T21:00:00.000Z");
});

test("download quota reports only configured periods and the tightest availability", () => {
  const now = new Date("2026-07-25T12:00:00.000Z");
  const snapshot = buildDownloadQuotaSnapshot(
    {
      id: "user-1",
      downloadLimitTotal: 10,
      downloadLimitDaily: 2,
      downloadLimitWeekly: null,
      downloadTotalResetAt: null,
      downloadDailyResetAt: null,
      downloadWeeklyResetAt: null,
      downloads: [
        { addedAt: new Date("2026-07-20T12:00:00.000Z") },
        { addedAt: new Date("2026-07-25T08:00:00.000Z") },
        { addedAt: new Date("2026-07-25T09:00:00.000Z") },
      ],
    },
    now,
  );

  assert.equal(snapshot.configured, true);
  assert.equal(snapshot.periods.length, 2);
  assert.deepEqual(
    snapshot.periods.map(({ key, used, remaining, percent }) => ({
      key,
      used,
      remaining,
      percent,
    })),
    [
      { key: "absolute", used: 3, remaining: 7, percent: 30 },
      { key: "daily", used: 2, remaining: 0, percent: 100 },
    ],
  );
  assert.equal(snapshot.available, 0);
  assert.equal(snapshot.blockingPeriod, "daily");
});

test("manual reset excludes earlier downloads without deleting them", () => {
  const now = new Date("2026-07-25T12:00:00.000Z");
  const snapshot = buildDownloadQuotaSnapshot(
    {
      id: "user-1",
      downloadLimitTotal: 5,
      downloadLimitDaily: 5,
      downloadLimitWeekly: 5,
      downloadTotalResetAt: new Date("2026-07-25T10:00:00.000Z"),
      downloadDailyResetAt: new Date("2026-07-25T10:00:00.000Z"),
      downloadWeeklyResetAt: new Date("2026-07-25T10:00:00.000Z"),
      downloads: [
        { addedAt: new Date("2026-07-25T09:00:00.000Z") },
        { addedAt: new Date("2026-07-25T11:00:00.000Z") },
      ],
    },
    now,
  );

  assert.deepEqual(snapshot.periods.map((period) => period.used), [1, 1, 1]);
});
