import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const possibleCommitsToMergeFrom = execFileSync("git", [
  "log",
  "--oneline",
  "--pretty=format:%h",
])
  .toString()
  .split("\n")
  .reverse()
  .filter((x) => x);

const { lastUpdatedAt } = JSON.parse(
  await readFile("./lastRecordByIdMapping.json", "utf8")
);
const lastRecordByIdMapping = {};

for (let i = 0; i < possibleCommitsToMergeFrom.length; i++) {
  const commitHash = possibleCommitsToMergeFrom[i];
  execFileSync("git", [
    "restore",
    "-s",
    commitHash,
    "--",
    "./searchResults.json",
  ]).toString();

  const { searchResults } = JSON.parse(
    await readFile("./searchResults.json", "utf8")
  );

  let writtenCount = 0;
  searchResults.forEach((r) => {
    // Store only the ones with queue days information as that's the only thing that really changes.
    const lastAccept = r.$object_ad?.last_accept;
    if (typeof lastAccept === "number") {
      writtenCount += 1;
      lastRecordByIdMapping[r.id] = r;
    }
  });

  console.log(
    `${new Date().toISOString()} - Written ${writtenCount} records from commit ${commitHash} (progress: ${
      i + 1
    }/${possibleCommitsToMergeFrom.length})`
  );
}

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
