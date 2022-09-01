import { writeFile, readFile } from "node:fs/promises";
import isPointInPolygon from "@turf/boolean-point-in-polygon";

const districtGeoJson = JSON.parse(
  await readFile(new URL("./distrikt.geojson", import.meta.url))
);

const getDistrictName = ({ lat, lon }) => {
  return districtGeoJson.features.find((f) =>
    isPointInPolygon(
      {
        type: "Point",
        coordinates: [lon, lat],
      },
      f.geometry
    )
  )?.properties.distriktsnamn;
};

const filterForFetchingQueuePointsInfo = (x) =>
  x
    .filter((r) =>
      ["göteborg", "mölndal"].includes(r.address.city?.toLowerCase())
    )
    .filter((r) => !r.short_lease)
    .filter((r) => r.audience !== "student");

// Main
{
  const searchResults = await fetch("https://search.homeq.se/api/v2/search", {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    referrer: "https://search.homeq.se/",
    body: '{"shapes":[]}',
    method: "POST",
  })
    .then((res) => res.json())
    .then(async ({ results }) => {
      let ptr = 0;
      const filtered = filterForFetchingQueuePointsInfo(results);

      for (const r of filtered) {
        ptr++;
        console.log(
          `${new Date().toISOString()} - Fetching object info for filtered objects...: ${ptr}/${
            filtered.length
          }`
        );

        do {
          await new Promise((resolve) => setTimeout(resolve, 2400));
          const { object_ad } = await fetch(
            `https://www.homeq.se/api/v1/object/${r.id}`,
            {
              headers: {
                accept: "application/json",
                "content-type": "application/json",
              },
              referrer: "https://www.homeq.se/",
              method: "GET",
            }
          ).then((res) => res.json());

          if (object_ad) {
            r.$object_ad = object_ad;
            break;
          }
        } while (true);
      }

      return results;
    });

  searchResults.forEach((r) => {
    const n = getDistrictName(r.location);
    if (n) {
      r.$districtName = n;
    }
  });

  await writeFile(
    "./searchResults.json",
    JSON.stringify(
      {
        lastUpdatedAt: new Date().toISOString(),
        searchResults,
      },
      null,
      2
    )
  );

  const observationRecordTimestamp = new Date().toISOString();
  const observations = JSON.parse(
    await readFile(new URL("../observations.json", import.meta.url))
  ).observations;

  const currentActiveIds = new Set(searchResults.map((r) => r.id));
  Object.entries(observations)
    .filter(
      ([id, { events }]) => !currentActiveIds.has(id) && events.at(-1).active
    )
    .forEach(([id, { events }]) => {
      events.push({
        timestamp: observationRecordTimestamp,
        active: false,
      });
    });

  searchResults.forEach((r) => {
    observations[r.id] ??= {
      type: r.type,
      address: r.address,
      accessDate: r.access_date,
      publishDate: r.publish_date,
      districtName: r.$districtName,
      sortingMode: r.sorting_mode,
    };
    observations[r.id].events ??= [];
    const events = observations[r.id].events;
    events.push({
      timestamp: observationRecordTimestamp,
      minimumQueueDaysOfTop10Applicants: r.$object_ad?.last_accept ?? null,
      active: true,
    });
  });

  await writeFile(
    "./observations.json",
    JSON.stringify(
      {
        lastUpdatedAt: observationRecordTimestamp,
        observations,
      },
      null,
      2
    )
  );
}
