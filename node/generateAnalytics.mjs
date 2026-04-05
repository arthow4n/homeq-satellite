import fs from 'fs';

function generateAnalytics() {
  console.log("Reading lastRecordByIdMapping.json...");
  const rawData = fs.readFileSync('lastRecordByIdMapping.json', 'utf8');
  const mapping = JSON.parse(rawData).lastRecordByIdMapping;
  const records = Object.values(mapping);

  console.log(`Processing ${records.length} records...`);

  const recordsWithQueuePoints = records.filter(r =>
    r.$object_ad &&
    typeof r.$object_ad.last_accept === 'number' &&
    r.$object_ad.last_accept !== -1
  );

  console.log(`Found ${recordsWithQueuePoints.length} records with valid queue points.`);

  // 1. Queue Points over Time (grouped by YYYY-MM of publish_date)
  const queuePointsOverTime = {};

  // 2. Queue Points by City
  const queuePointsByCity = {};

  // 3. Queue Points by ROK (Rooms)
  const queuePointsByROK = {};

  // 4. Scatter Plot Data: Rent/m2 vs Queue Points (Sampled down to avoid massive JSON)
  const rentPerM2VsQueuePoints = [];

  recordsWithQueuePoints.forEach(r => {
    const queuePoints = r.$object_ad.last_accept;
    const date = r.publish_date || r.$object_ad.date_publish;

    if (date) {
      const monthYear = date.substring(0, 7); // YYYY-MM
      if (!queuePointsOverTime[monthYear]) {
        queuePointsOverTime[monthYear] = [];
      }
      queuePointsOverTime[monthYear].push(queuePoints);
    }

    const city = r.address?.city || r.$object_ad?.city;
    if (city) {
      const normalizedCity = city.trim();
      if (!queuePointsByCity[normalizedCity]) {
        queuePointsByCity[normalizedCity] = [];
      }
      queuePointsByCity[normalizedCity].push(queuePoints);
    }

    const rok = r.rooms || r.$object_ad?.get_rooms;
    if (rok) {
      const parsedRok = parseFloat(rok);
      if (!isNaN(parsedRok)) {
        if (!queuePointsByROK[parsedRok]) {
          queuePointsByROK[parsedRok] = [];
        }
        queuePointsByROK[parsedRok].push(queuePoints);
      }
    }

    const rent = Array.isArray(r.rent) ? Math.min(...r.rent) : r.rent || r.$object_ad?.rent;
    const area = Array.isArray(r.area) ? Math.min(...r.area) : r.area || r.$object_ad?.area;

    if (rent && area) {
      const rentPerM2 = Math.round(rent / area);
      // Deterministic sample (~10%) to keep data size manageable and avoid noisy git diffs
      if (r.id % 10 === 0) {
         rentPerM2VsQueuePoints.push({
           x: rentPerM2,
           y: queuePoints,
           city: city
         });
      }
    }
  });

  const median = (arr) => {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };

  const average = (arr) => {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  };

  const aggregate = (dataObj) => {
    const result = {};
    for (const [key, values] of Object.entries(dataObj)) {
      result[key] = {
        count: values.length,
        average: Math.round(average(values)),
        median: Math.round(median(values))
      };
    }
    return result;
  };

  // Only keep cities with at least 50 records for clearer chart
  const aggregatedCities = aggregate(queuePointsByCity);
  const filteredCities = {};
  for (const [city, stats] of Object.entries(aggregatedCities)) {
    if (stats.count >= 50) {
      filteredCities[city] = stats;
    }
  }

  const finalData = {
    lastUpdated: new Date().toISOString(),
    queuePointsOverTime: aggregate(queuePointsOverTime),
    queuePointsByCity: filteredCities,
    queuePointsByROK: aggregate(queuePointsByROK),
    rentPerM2VsQueuePoints: rentPerM2VsQueuePoints
  };

  console.log("Writing to analytics-data.json...");
  fs.writeFileSync('analytics-data.json', JSON.stringify(finalData, null, 2));
  console.log("Done!");
}

generateAnalytics();
