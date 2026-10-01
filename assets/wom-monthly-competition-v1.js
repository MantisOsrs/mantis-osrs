(() => {
  "use strict";

  const CACHE_KEY = "mantis-wom-october-leaders-v1";
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const RANK_LABELS = ["First", "Second", "Third", "Fourth", "Fifth"];
  const COMPETITIONS = Object.freeze({
    ehb: 155166,
    xp: 155167
  });

  const leaderboards = new Map(
    Array.from(document.querySelectorAll("[data-wom-leaderboard]"), (element) => [
      element.dataset.womLeaderboard,
      element
    ])
  );
  const liveStatus = document.querySelector("[data-wom-live-status]");
  const liveUpdated = liveStatus?.querySelector("[data-wom-updated]");

  if (!leaderboards.size) return;

  const emptyCache = () => ({ competitions: {} });

  const readCache = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!parsed || typeof parsed !== "object" || !parsed.competitions) return emptyCache();
      return parsed;
    } catch (_error) {
      return emptyCache();
    }
  };

  const writeCache = (cache) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_error) {
      // Live standings still work when browser storage is unavailable.
    }
  };

  const parseCsvLine = (line) => {
    const fields = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === "," && !quoted) {
        fields.push(field);
        field = "";
      } else {
        field += character;
      }
    }

    fields.push(field);
    return fields;
  };

  const normalizeStandings = (csv) => {
    if (typeof csv !== "string") throw new Error("Wise Old Man returned invalid standings.");

    const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(lines[0] || "").map((header) => header.trim().toLowerCase());
    const rankIndex = headers.indexOf("rank");
    const usernameIndex = headers.indexOf("username");
    const gainedIndex = headers.indexOf("gained");

    if (rankIndex < 0 || usernameIndex < 0 || gainedIndex < 0) {
      throw new Error("Wise Old Man returned an unexpected standings format.");
    }

    const standings = lines.slice(1, 6).map((line, index) => {
      const fields = parseCsvLine(line);
      const rank = Number(fields[rankIndex]);
      const name = String(fields[usernameIndex] || "").trim().slice(0, 64);
      const gained = Number(fields[gainedIndex]);

      if (rank !== index + 1 || !name || !Number.isFinite(gained)) {
        throw new Error("Wise Old Man returned incomplete standings.");
      }

      return { name, gained };
    });

    if (standings.length !== 5) {
      throw new Error("Wise Old Man returned incomplete standings.");
    }

    return standings;
  };

  const trimZeros = (value) => value.replace(/\.0+$|(?<=\.[0-9])0$/, "");

  const formatCompactXp = (value) => {
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 1_000_000_000) return `${trimZeros((value / 1_000_000_000).toFixed(2))}b`;
    if (absoluteValue >= 1_000_000) return `${trimZeros((value / 1_000_000).toFixed(2))}m`;
    if (absoluteValue >= 1_000) return `${trimZeros((value / 1_000).toFixed(1))}k`;
    return Math.round(value).toLocaleString("en-US");
  };

  const formatValue = (metric, value) => {
    const sign = value >= 0 ? "+" : "";
    if (metric === "ehb") {
      return `${sign}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EHB`;
    }
    return `${sign}${formatCompactXp(value)} XP`;
  };

  const formatExactValue = (metric, value) => {
    const sign = value >= 0 ? "+" : "";
    const options = metric === "ehb"
      ? { minimumFractionDigits: 2, maximumFractionDigits: 5 }
      : { maximumFractionDigits: 0 };
    return `${sign}${value.toLocaleString("en-US", options)} ${metric === "ehb" ? "EHB" : "XP"}`;
  };

  const renderStandings = (metric, standings) => {
    const leaderboard = leaderboards.get(metric);
    if (!leaderboard || !Array.isArray(standings)) return;

    Array.from(leaderboard.querySelectorAll("li")).slice(0, 5).forEach((row, index) => {
      const standing = standings[index];
      const nameSlot = row.querySelector(".home-monthly-name-slot");
      const valueSlot = row.querySelector(".home-monthly-value-slot");
      const name = typeof standing?.name === "string" ? standing.name : "";
      const gained = Number(standing?.gained);
      const hasValue = Number.isFinite(gained);
      const displayValue = hasValue ? formatValue(metric, gained) : "";

      if (nameSlot) nameSlot.textContent = name;
      if (valueSlot) {
        valueSlot.textContent = displayValue;
        valueSlot.title = hasValue ? formatExactValue(metric, gained) : "";
      }
      row.setAttribute(
        "aria-label",
        name && hasValue
          ? `${RANK_LABELS[index]} place: ${name}, ${formatExactValue(metric, gained)}`
          : `${RANK_LABELS[index]} place unavailable`
      );
    });
  };

  let liveState = "live";

  const getStandingsTimestamp = () => {
    const timestamps = Object.keys(COMPETITIONS)
      .map((metric) => Number(cache.competitions?.[metric]?.fetchedAt) || 0)
      .filter((timestamp) => timestamp > 0);
    return timestamps.length ? Math.min(...timestamps) : 0;
  };

  const formatElapsed = (timestamp) => {
    const elapsed = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return "Updated just now";
    if (minutes < 60) return `Updated ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Updated ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `Updated ${days}d ago`;
  };

  const updateLiveStatus = (state = liveState) => {
    liveState = state;
    if (!liveStatus || !liveUpdated) return;

    const timestamp = getStandingsTimestamp();
    const elapsedLabel = timestamp ? formatElapsed(timestamp) : "";
    liveStatus.dataset.state = state;
    liveUpdated.textContent = timestamp
      ? state === "saved" ? `Saved · ${elapsedLabel}` : elapsedLabel
      : state === "saved" ? "WOM unavailable" : "Connecting…";
    liveStatus.setAttribute(
      "aria-label",
      state === "saved" ? `Saved standings. ${elapsedLabel || "Wise Old Man unavailable"}` : `Live standings. ${elapsedLabel || "Connecting"}`
    );

    if (timestamp) {
      liveUpdated.dateTime = new Date(timestamp).toISOString();
      liveUpdated.title = `Last refreshed ${new Date(timestamp).toLocaleString()}`;
    } else {
      liveUpdated.removeAttribute("datetime");
      liveUpdated.removeAttribute("title");
    }
  };

  let cache = readCache();

  Object.keys(COMPETITIONS).forEach((metric) => {
    const cachedStandings = cache.competitions?.[metric]?.standings;
    if (Array.isArray(cachedStandings)) renderStandings(metric, cachedStandings);
  });
  updateLiveStatus();

  const refreshMetric = async (metric) => {
    const competitionId = COMPETITIONS[metric];
    const cachedCompetition = cache.competitions?.[metric];
    const fetchedAt = Number(cachedCompetition?.fetchedAt) || 0;

    if (Date.now() - fetchedAt < CACHE_TTL_MS) return;

    const response = await fetch(
      `https://api.wiseoldman.net/v2/competitions/${competitionId}/csv`,
      {
        method: "GET",
        headers: { Accept: "text/csv" },
        cache: "no-store"
      }
    );

    if (!response.ok) throw new Error(`Wise Old Man returned ${response.status}.`);

    const standings = normalizeStandings(await response.text());
    renderStandings(metric, standings);

    cache.competitions[metric] = {
      competitionId,
      fetchedAt: Date.now(),
      standings
    };
    writeCache(cache);
  };

  const refreshStandings = async () => {
    const results = await Promise.allSettled(
      Object.keys(COMPETITIONS).map((metric) => refreshMetric(metric))
    );
    updateLiveStatus(results.some((result) => result.status === "rejected") ? "saved" : "live");
    return results;
  };

  refreshStandings();

  window.setInterval(() => updateLiveStatus(), 60 * 1000);
})();
