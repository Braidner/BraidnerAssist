import assert from "node:assert/strict";
import test from "node:test";
import { buildJellyfinUserActivity } from "../src/integrations/jellyfinUserActivity.js";

test("builds per-user online, playback, bitrate and history activity", () => {
  const data = buildJellyfinUserActivity({
    now: new Date("2026-07-24T14:10:00.000Z"),
    appUsers: [
      {
        id: "app-1",
        username: "owner",
        displayName: "Owner",
        role: "admin",
        active: true,
        jellyfinUserId: "jf-1",
      },
    ],
    jellyfinUsers: [
      { id: "jf-1", name: "owner" },
      { id: "jf-2", name: "guest" },
    ],
    sessions: [
      {
        Id: "session-1",
        UserId: "jf-1",
        IsActive: true,
        Client: "Jellyfin Web",
        DeviceName: "MacBook",
        LastActivityDate: "2026-07-24T14:09:55.000Z",
        NowPlayingItem: {
          Id: "episode-1",
          SeriesId: "series-1",
          Name: "Episode 2",
          SeriesName: "Show",
          Type: "Episode",
          ParentIndexNumber: 1,
          IndexNumber: 2,
          RunTimeTicks: 10_000_000_000,
        },
        PlayState: {
          PositionTicks: 5_000_000_000,
          IsPaused: false,
        },
        TranscodingInfo: {
          Bitrate: 8_000_000,
          Width: 1920,
          Height: 1080,
          VideoCodec: "h264",
          AudioCodec: "aac",
        },
      },
      {
        Id: "session-2",
        UserId: "jf-2",
        IsActive: false,
        LastActivityDate: "2026-07-24T12:00:00.000Z",
      },
    ],
    historyByUserId: {
      "jf-1": [
        {
          Id: "movie-1",
          Name: "Movie",
          Type: "Movie",
          RunTimeTicks: 72_000_000_000,
          UserData: {
            LastPlayedDate: "2026-07-24T13:00:00.000Z",
            PlayedPercentage: 64,
            PlayCount: 2,
            Played: false,
          },
        },
        {
          Id: "never-played",
          Name: "Never played",
          UserData: { PlayCount: 0 },
        },
      ],
      "jf-2": [],
    },
  });

  assert.deepEqual(data.summary, {
    users: 2,
    online: 1,
    watching: 1,
    liveBitrate: 8_000_000,
  });

  const owner = data.users[0];
  assert.equal(owner.displayName, "Owner");
  assert.equal(owner.online, true);
  assert.equal(owner.linked, true);
  assert.deepEqual(owner.devices, [{ name: "MacBook", client: "Jellyfin Web" }]);
  assert.equal(owner.nowPlaying[0]?.progressPct, 50);
  assert.equal(owner.nowPlaying[0]?.playMethod, "Transcode");
  assert.equal(owner.nowPlaying[0]?.resolution, "1920×1080");
  assert.equal(owner.liveBitrate, 8_000_000);
  assert.equal(owner.history.length, 1);
  assert.equal(owner.history[0]?.progressPct, 64);

  const guest = data.users[1];
  assert.equal(guest.appUserId, null);
  assert.equal(guest.linked, false);
  assert.equal(guest.online, false);
});
