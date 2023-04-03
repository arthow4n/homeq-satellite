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

const filterForFetchingQueuePointsInfo = (x) => {
  const areasToFetch = [
    "göteborg",
    "mölndal",
    "partille",
    "stockholm",
    "malmö",
  ];

  return x
    .filter(
      (r) =>
        areasToFetch.includes(r.address.city?.toLocaleLowerCase("sv")) ||
        areasToFetch.includes(r.address.municipality?.toLocaleLowerCase("sv"))
    )
    .filter((r) => !r.short_lease)
    .filter((r) => r.audience !== "student");
};

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
          } (object id: ${r.id})`
        );

        const maxTries = 2;
        for (let tries = 1; tries <= maxTries; tries++) {
          await new Promise((resolve) => setTimeout(resolve, 2400));
          const url = `https://www.homeq.se/api/v1/object/${r.id}`;
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => {
              controller.abort();
            }, 5000);

            const res = await fetch(url, {
              headers: {
                accept: "application/json",
                "content-type": "application/json",
              },
              referrer: "https://www.homeq.se/",
              method: "GET",
              signal: controller.signal,
            });

            if (!res.ok) {
              console.log(
                `${new Date().toISOString()} - HTTP error when getting object_ad (object id: ${
                  r.id
                }, url: ${url}, status: ${res.status} ${
                  res.statusText
                }, response body is logged in the next line)`
              );
              console.log(
                `${new Date().toISOString()} - HTTP error when getting object_ad (object id: ${
                  r.id
                }, body: ${await res.text()})`
              );
              continue;
            }

            const { object_ad } = await res.json();
            clearTimeout(timeout);

            if (object_ad) {
              r.$object_ad = object_ad;
              console.log(
                `${new Date().toISOString()} - Got queue information from object_ad (object id: ${
                  r.id
                }, last_accept: ${r.$object_ad.last_accept})`
              );
            } else {
              console.log(
                `${new Date().toISOString()} - Couldn't get object_ad (object id: ${
                  r.id
                })`
              );
            }

            break;
          } catch (e) {
            console.log(
              `${new Date().toISOString()} - Got exception when trying to fetch ${url}, exception: ${e}, retries ${tries}/${maxTries}`
            );
          }
        }
      }

      return results;
    });

  searchResults.forEach((r) => {
    const n = getDistrictName(r.location);
    if (n) {
      r.$districtName = n;
    }
  });

  const lastUpdatedAt = new Date().toISOString();
  await writeFile(
    "./searchResults.json",
    JSON.stringify(
      {
        lastUpdatedAt,
        searchResults,
      },
      null,
      2
    )
  );

  const { lastRecordByIdMapping } = JSON.parse(
    await readFile("./lastRecordByIdMapping.json", "utf8")
  );
  searchResults.forEach((r) => {
    // Store only the ones with queue days information as that's the only thing that really changes.
    const lastAccept = r.$object_ad?.last_accept;
    if (typeof lastAccept === "number") {
      lastRecordByIdMapping[r.id] = r;
    }
  });
  await writeFile(
    "./lastRecordByIdMapping.json",
    JSON.stringify(
      {
        lastUpdatedAt,
        lastRecordByIdMapping,
      },
      null,
      2
    )
  );
}
