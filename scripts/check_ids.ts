import fs from 'fs';

function checkIds() {
  const fileContent = fs.readFileSync('./data/fixtures-manifest.json', 'utf8');
  const fixtures = JSON.parse(fileContent);

  const withIds = fixtures.filter((f: any) => f.sportmonksHomeTeamId || f.sportmonksAwayTeamId);
  console.log(`Fixtures with Sportmonks IDs: ${withIds.length}`);
}

checkIds();
