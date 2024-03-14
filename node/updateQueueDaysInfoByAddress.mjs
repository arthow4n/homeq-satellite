import { writeFile, readFile } from "node:fs/promises";

const { lastUpdatedAt, searchResults } = JSON.parse(
  await readFile("./searchResults.json", "utf8")
);
const { lastRecordByIdMapping } = JSON.parse(
  await readFile("./lastRecordByIdMapping.json", "utf8")
);

// Remove the objects that are still open,
// so it doesn't create a skewed estimation rendered in the frontend.
searchResults.forEach((r) => {
  delete lastRecordByIdMapping[r.id];
});

const normalisedValuesForGrouping = Object.values(lastRecordByIdMapping)
  .filter((r) => r.$object_ad)
  .map((r) => {
    // Can add common misspelling fix here later
    return {
      id: r.id,
      rent: r.rent,
      area: r.area,
      street: (r.$object_ad.street || "").toLocaleLowerCase("sv"),
      street_number: (r.$object_ad.street_number || "").toLocaleLowerCase("sv"),
      city: (r.$object_ad.city || "").toLocaleLowerCase("sv"),
      municipality: (r.$object_ad.municipality || "").toLocaleLowerCase("sv"),
      county: (r.$object_ad.county || "").toLocaleLowerCase("sv"),
      $districtName: (r.$districtName || "").toLocaleLowerCase("sv"),
      last_accept: r.$object_ad.last_accept,
      $last_seen: r.$last_seen,
    };
  });

const queueDaysInfoByAddress = {};
normalisedValuesForGrouping.forEach((r) => {
  const { county, municipality, city, $districtName, street } = r;
  queueDaysInfoByAddress[county] ??= {};
  queueDaysInfoByAddress[county][municipality] ??= {};
  queueDaysInfoByAddress[county][municipality][city] ??= {};
  queueDaysInfoByAddress[county][municipality][city][$districtName] ??= {};
  queueDaysInfoByAddress[county][municipality][city][$districtName][street] ??=
    [];
  queueDaysInfoByAddress[county][municipality][city][$districtName][
    street
  ].push(r);
});

await writeFile(
  "./queueDaysInfoByAddress.json",
  JSON.stringify(
    {
      lastUpdatedAt,
      queueDaysInfoByAddress,
    },
    null,
    2
  )
);
