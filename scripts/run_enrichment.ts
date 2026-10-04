import fs from 'fs';
import { enrichFixturesWithFootballApis } from '../src/services/serverFootballProviderEnrichment';

async function runEnrichment() {
  const fileContent = fs.readFileSync('./data/fixtures-manifest.json', 'utf8');
  const fixtures = JSON.parse(fileContent);

  console.log(`Starting enrichment for ${fixtures.length} fixtures...`);

  const requestedDates = Array.from(new Set(
    fixtures
      .map((fixture: any) => String(fixture.kickoffTime).slice(0, 10))
      .filter(Boolean)
  )) as string[];

  const result = await enrichFixturesWithFootballApis(fixtures, requestedDates);

  if (result.errors && result.errors.length > 0) {
    console.log('Enrichment Errors:', result.errors);
  }

  console.log('Enrichment Result Summary:', {
    apiFootballFixtures: result.apiFootballFixtures,
    sportmonksFixtures: result.sportmonksFixtures,
    errors: result.errors.length
  });

  fs.writeFileSync('./data/fixtures-manifest-enriched.json', JSON.stringify(result.fixtures, null, 2));
  console.log('Enriched fixtures saved to ./data/fixtures-manifest-enriched.json');
}

runEnrichment().catch(console.error);
