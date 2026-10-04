import fs from 'fs';

function runPostEnrichmentAudit() {
  const fileContent = fs.readFileSync('./data/fixtures-manifest-enriched.json', 'utf8');
  const fixtures = JSON.parse(fileContent);

  let sportApiExact = 0;
  let sportApiHistory = 0;
  let sportmonksExact = 0;
  let sportmonksHistory = 0;
  let apiFootballExact = 0;
  let apiFootballHistory = 0;
  let footballDataFallback = 0;
  let noEvidence = 0;

  for (const f of fixtures) {
    const evSrc = (f as any).evidenceSource;
    if (evSrc === 'SportAPI.ai-team-history') {
      sportApiHistory++;
    } else if (evSrc === 'Sportmonks-team-history') {
      sportmonksHistory++;
    } else if (evSrc === 'API-Football-team-history') {
      apiFootballHistory++;
    } else if (f.sportApiAiFixtureId) {
      sportApiExact++;
    } else if (f.sportmonksFixtureId) {
      sportmonksExact++;
    } else if (f.apiFootballFixtureId) {
      apiFootballExact++;
    } else if (f.homeTeam.formSource === 'FOOTBALL_DATA_ORG' || f.awayTeam.formSource === 'FOOTBALL_DATA_ORG') {
      footballDataFallback++;
    } else {
      noEvidence++;
    }
  }

  console.log(JSON.stringify({
    sportApiExact,
    sportApiHistory,
    sportmonksExact,
    sportmonksHistory,
    apiFootballExact,
    apiFootballHistory,
    footballDataFallback,
    noEvidence
  }, null, 2));
}

runPostEnrichmentAudit();
