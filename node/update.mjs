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
          const url = `https://www.homeq.se/api/v1/object/${r.id}`;
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => {
              controller.abort();
            }, 5000);

            const { object_ad } = await fetch(url, {
              headers: {
                accept: "application/json",
                "content-type": "application/json",
              },
              referrer: "https://www.homeq.se/",
              method: "GET",
              signal: controller.signal,
            }).then((res) => {
              clearTimeout(timeout);
              return res.json();
            });

            if (object_ad) {
              r.$object_ad = object_ad;
              break;
            }
          } catch (e) {
            console.log(
              `${new Date().toISOString()} - Got exception when trying to fetch ${url}, exception: ${e}`
            );
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
}
