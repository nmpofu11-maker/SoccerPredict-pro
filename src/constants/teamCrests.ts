/**
 * Real Club Crests & Badges Dictionary
 * Maps team names to high-resolution, publicly accessible SVG / PNG club crests.
 */
export const TEAM_CRESTS: Record<string, string> = {
  // English Premier League
  "Manchester City": "https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg",
  "Arsenal": "https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg",
  "Liverpool": "https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg",
  "Chelsea": "https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg",
  "Manchester United": "https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg",
  "Tottenham Hotspur": "https://upload.wikimedia.org/wikipedia/en/b/b4/Tottenham_Hotspur.svg",

  // Spanish La Liga
  "Real Madrid": "https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg",
  "Barcelona": "https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg",
  "Atletico Madrid": "https://upload.wikimedia.org/wikipedia/en/f/f4/Atletico_Madrid_2017_logo.svg",
  "Sevilla": "https://upload.wikimedia.org/wikipedia/en/3/3b/Sevilla_FC_logo.svg",
  "Athletic Bilbao": "https://upload.wikimedia.org/wikipedia/en/9/98/Club_Athletic_Bilbao_logo.svg",

  // German Bundesliga
  "Bayern Munich": "https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg",
  "Borussia Dortmund": "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg",
  "Bayer Leverkusen": "https://upload.wikimedia.org/wikipedia/en/5/59/Bayer_04_Leverkusen_logo.svg",
  "RB Leipzig": "https://upload.wikimedia.org/wikipedia/en/0/04/RB_Leipzig_2020_logo.svg",

  // Italian Serie A
  "Napoli": "https://upload.wikimedia.org/wikipedia/commons/2/28/SSC_Napoli_logo_%282024%29.svg",
  "Inter Milan": "https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg",
  "Juventus": "https://upload.wikimedia.org/wikipedia/commons/1/15/Juventus_FC_2017_logo.svg",
  "AC Milan": "https://upload.wikimedia.org/wikipedia/commons/d/d0/Logo_of_AC_Milan.svg",
  "AS Roma": "https://upload.wikimedia.org/wikipedia/en/f/f7/AS_Roma_logo_%282017%29.svg",
  "Cagliari": "https://upload.wikimedia.org/wikipedia/en/6/61/Cagliari_Calcio_1920.svg",

  // French Ligue 1
  "Paris Saint-Germain": "https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg",
  "Olympique de Marseille": "https://upload.wikimedia.org/wikipedia/en/4/43/Olympique_de_Marseille_logo.svg",
  "FC Nantes": "https://upload.wikimedia.org/wikipedia/commons/2/25/FC_Nantes_logo_%282019%29.svg",
  "Stade de Reims": "https://upload.wikimedia.org/wikipedia/en/3/37/Stade_de_Reims_logo.svg",

  // English Championship
  "Leeds United": "https://upload.wikimedia.org/wikipedia/en/5/54/Leeds_United_F.C._logo.svg",
  "Sunderland": "https://upload.wikimedia.org/wikipedia/en/7/77/Logo_Sunderland_AFC.svg",

  // Dutch Eredivisie
  "Feyenoord": "https://upload.wikimedia.org/wikipedia/en/e/e3/Feyenoord_logo.svg",
  "Ajax": "https://upload.wikimedia.org/wikipedia/en/7/79/Ajax_Amsterdam.svg",
  "PSV Eindhoven": "https://upload.wikimedia.org/wikipedia/en/0/05/PSV_Eindhoven.svg",
  "NEC Nijmegen": "https://upload.wikimedia.org/wikipedia/en/e/ed/NEC_Nijmegen_logo.svg",

  // Portuguese Primeira Liga
  "Benfica": "https://upload.wikimedia.org/wikipedia/en/a/a2/SL_Benfica_logo.svg",
  "Sporting CP": "https://upload.wikimedia.org/wikipedia/en/e/e1/Sporting_Clube_de_Portugal_%28Logo%29.svg",
  "FC Porto": "https://upload.wikimedia.org/wikipedia/en/f/f1/FC_Porto.svg",

  // Americas
  "Boca Juniors": "https://upload.wikimedia.org/wikipedia/commons/4/41/CABJ_escudo.svg",
  "River Plate": "https://upload.wikimedia.org/wikipedia/commons/a/ac/Escudo_del_C_A_River_Plate.svg",
  "Flamengo": "https://upload.wikimedia.org/wikipedia/commons/2/2e/Flamengo_braz_logo.svg",
  "Palmeiras": "https://upload.wikimedia.org/wikipedia/commons/1/10/Palmeiras_logo.svg",
  "Inter Miami": "https://upload.wikimedia.org/wikipedia/en/5/5c/Inter_Miami_CF_logo.svg",
  "LA Galaxy": "https://upload.wikimedia.org/wikipedia/en/7/70/Los_Angeles_Galaxy_logo.svg",
  "Club América": "https://upload.wikimedia.org/wikipedia/commons/1/18/Club_Am%C3%A9rica_logo.svg",
  "Guadalajara Chivas": "https://upload.wikimedia.org/wikipedia/en/3/36/Club_Deportivo_Guadalajara_logo.svg",
  "Colo-Colo": "https://upload.wikimedia.org/wikipedia/commons/c/c5/Escudo_del_Club_Social_y_Deportivo_Colo-Colo.svg",
  "Universidad de Chile": "https://upload.wikimedia.org/wikipedia/commons/5/52/Club_Universidad_de_Chile_logo.svg",
  "Bolivar": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Club_Bol%C3%ADvar_logo.svg",
  "Jorge Wilstermann": "https://upload.wikimedia.org/wikipedia/commons/7/78/Escudo_del_Club_Jorge_Wilstermann.svg",
  "Real Cartagena": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Real_Cartagena_logo.svg",
  "Atletico Nacional": "https://upload.wikimedia.org/wikipedia/commons/9/9a/Escudo_de_Atl%C3%A9tico_Nacional.svg",

  // Scottish Premiership
  "Celtic": "https://upload.wikimedia.org/wikipedia/en/3/35/Celtic_FC.svg",
  "Rangers": "https://upload.wikimedia.org/wikipedia/en/4/43/Rangers_FC.svg",
  "St Johnstone FC": "https://upload.wikimedia.org/wikipedia/en/9/90/St_Johnstone_FC_crest.svg",

  // Belgian Pro League
  "Club Brugge": "https://upload.wikimedia.org/wikipedia/en/d/d0/Club_Brugge_KV_logo.svg",
  "RC Sporting Charleroi": "https://upload.wikimedia.org/wikipedia/en/9/9e/R._Charleroi_S.C._logo.svg",

  // Croatian HNL & Romanian Liga I
  "Dinamo Zagreb": "https://upload.wikimedia.org/wikipedia/en/b/b3/GNK_Dinamo_Zagreb_logo.svg",
  "Rijeka": "https://upload.wikimedia.org/wikipedia/en/4/4a/HNK_Rijeka_logo.svg",
  "Fotbal Club FCSB": "https://upload.wikimedia.org/wikipedia/commons/4/4e/FCSB_logo.svg",
  "CFR Cluj": "https://upload.wikimedia.org/wikipedia/en/0/07/CFR_Cluj_logo.svg",

  // Greece & Turkey
  "Olympiacos": "https://upload.wikimedia.org/wikipedia/en/f/f1/Olympiacos_FC_logo.svg",
  "Panathinaikos": "https://upload.wikimedia.org/wikipedia/en/3/31/Panathinaikos_FC_logo.svg",
  "Trabzonspor": "https://upload.wikimedia.org/wikipedia/en/4/42/Trabzonspor_Amblemi.svg",
  "Konyaspor": "https://upload.wikimedia.org/wikipedia/en/6/6f/Konyaspor_logo.svg",

  // Asia & Middle East
  "Al Hilal": "https://upload.wikimedia.org/wikipedia/en/d/d3/Al_Hilal_SFC_Logo_%282022%29.svg",
  "Al Nassr": "https://upload.wikimedia.org/wikipedia/en/9/93/Al-Nassr_FC_logo_%282020%29.svg",
  "Urawa Red Diamonds": "https://upload.wikimedia.org/wikipedia/en/1/1a/Urawa_Red_Diamonds_logo.svg",
  "FC Tokyo": "https://upload.wikimedia.org/wikipedia/en/8/87/FC_Tokyo_logo.svg",
  "Ulsan HD": "https://upload.wikimedia.org/wikipedia/en/6/66/Ulsan_HD_FC_logo.svg",
  "Pohang Steelers": "https://upload.wikimedia.org/wikipedia/en/3/36/Pohang_Steelers_logo.svg",
  "Shanghai Shenhua": "https://upload.wikimedia.org/wikipedia/en/e/ec/Shanghai_Shenhua_FC_logo.svg",
  "Shanghai Port": "https://upload.wikimedia.org/wikipedia/en/f/f6/Shanghai_Port_FC_logo.svg",
  "Johor Darul Ta'zim FC": "https://upload.wikimedia.org/wikipedia/en/f/fa/Johor_Darul_Ta%27zim_F.C._logo.svg",

  // Other European & International
  "St Patrick's Athletic": "https://upload.wikimedia.org/wikipedia/en/e/e0/St_Patricks_Athletic_FC_crest.svg",
  "Sligo Rovers": "https://upload.wikimedia.org/wikipedia/en/a/ab/Sligo_Rovers_F.C._logo.svg",
  "Rigas Futbola Skola": "https://upload.wikimedia.org/wikipedia/en/5/52/FK_RFS_logo.svg",
  "Riga FC": "https://upload.wikimedia.org/wikipedia/en/6/6f/Riga_FC_logo.svg",
  "France U": "https://upload.wikimedia.org/wikipedia/fr/4/4f/Logo_F%C3%A9d%C3%A9ration_Fran%C3%A7aise_de_Football_2018.svg",
  "Uruguay": "https://upload.wikimedia.org/wikipedia/commons/d/df/Asociaci%C3%B3n_Uruguaya_de_F%C3%BAtbol_logo.svg",
};

export function getTeamCrestUrl(teamName: string): string | null {
  return TEAM_CRESTS[teamName] || null;
}
