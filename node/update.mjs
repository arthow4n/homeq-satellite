import { writeFile } from "node:fs/promises";

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
