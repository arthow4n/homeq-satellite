import { writeFile, readFile } from "node:fs/promises";

const { lastUpdatedAt, searchResults } = JSON.parse(
  await readFile("./searchResults.json", "utf8")
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
