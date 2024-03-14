import { writeFile } from "node:fs/promises";
import { getDistrictName } from "./utils.mjs";
import { writeFileSync } from "node:fs";

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
        areasToFetch.includes(r.city?.toLocaleLowerCase("sv")) ||
        areasToFetch.includes(r.municipality?.toLocaleLowerCase("sv"))
    )
    .filter((r) => !r.is_short_lease)
    .filter((r) => r.audience !== "student");
};

const fetchHomeqSearchResults = async () => {
  let allResults = [];
  let page = 0;

  while (true) {
    page += 1;

    const json = await fetch(
      "https://search.homeq.se/api/v3/search",
      {
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        referrer: "https://search.homeq.se/",
        body: JSON.stringify({
          sorting: "publish_date.desc",
          amount: 10000,
          page,
        }),
        method: "POST",
      }
    ).then(async (res) => {
      if (!res.ok) {
        console.log(
          "Failed to fetch the search result",
          res.status,
          await res.json()
        );
        throw new Error("Failed to fetch the search result");
      }
      return await res.json();
    });

    const { results, total_hits } = json;

    if (!results) {
      break;
    }

    allResults = allResults.concat(results);

    if (allResults.length >= total_hits) {
      break;
    }
  }

  if (!allResults.length) {
    throw new Error("Got 0 search result, has the API updated?");
  }

  return { results: allResults };
};

// Main
{
  const searchResults = await fetchHomeqSearchResults().then(async ({ results }) => {
    let ptr = 0;
    const filtered = filterForFetchingQueuePointsInfo(results);

    for (const r of filtered) {
      ptr++;
      console.log(
        `${new Date().toISOString()} - Fetching object info for filtered objects...: ${ptr}/${
          filtered.length
        } (object id: ${r.id})`
      );

      const maxTries = 5;
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

  const lastUpdatedAt = new Date().toISOString();

  searchResults.forEach((r) => {
    r["$last_seen"] = lastUpdatedAt;
    const districtName = getDistrictName(r.location);
    if (districtName) {
      r.$districtName = districtName;
    }
  });

  {
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
  }
}
