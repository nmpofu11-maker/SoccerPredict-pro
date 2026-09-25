import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseHollywoodbetsRawText } from '../src/services/hollywoodbetsParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rawText = `Israel
Hapoel Bnei Ein Mahel Vs Maccabi Maghar

more 
Israel • Israel Liga Bet
24 Sep - 13:30
Hapoel Bnei Ein Mahel
0.9
Draw
2.9
Maccabi Maghar
1.95
Israel
MACCABI KIRYAT ATA-BIALIK vs HAPOEL BNEI JAT UNITED

more 
Israel • Liga Alef
24 Sep - 13:45
MACCABI KIRYAT ATA-BIALIK
0.18
DRAW
4.8
HAPOEL BNEI JAT UNITED
12
International
MYANMAR vs TIMOR-LESTE

more 
International • FIFA ASEAN Cup
24 Sep - 14:00
MYANMAR
0.16
DRAW
6.2
TIMOR-LESTE
11
Israel
Maccabi Isfiya Vs Hapoel Givat Olga

more 
Israel • Israel Liga Bet
24 Sep - 14:30
Maccabi Isfiya
0.9
Draw
2.9
Hapoel Givat Olga
1.95
Argentina
Deportivo Muniz (R) vs Justo Jose de Urquiza (R)

more 
Argentina • Argentina Primera C Metropolitana Reserves
24 Sep - 15:00
Deportivo Muniz (R)
4.6
Draw
3
Justo Jose de Urquiza (R)
0.45
Argentina
Deportivo Espanol (R) vs CSR Espanol (R)

more 
Argentina • Argentina Primera C Metropolitana Reserves
24 Sep - 15:00
Deportivo Espanol (R)
0.2
Draw
4.2
CSR Espanol (R)
10.8
United Arab Emirates
Al Dhaid U21 Vs Shabab Al Ahli Dubai U21

more 
United Arab Emirates • United Arab Emirates League U21
24 Sep - 15:25
Al Dhaid U21
2.2
Draw
3.4
Shabab Al Ahli Dubai U21
0.7
North Macedonia
FK TETEKS 1953 vs FK RABOTNICKI SKOPJE

more 
North Macedonia • 2. MFL
24 Sep - 15:30
FK TETEKS 1953
3.2
DRAW
2.75
FK RABOTNICKI SKOPJE
0.65
Israel
Maccabi Kishronot Hadera (W) vs Maccabi Holon (W)

more 
Israel • Israel Division 1 Women
24 Sep - 15:30
Maccabi Kishronot Hadera (W)
0.65
Draw
2.8
Maccabi Holon (W)
3
Egypt
FC MASAR vs PROXY SC

more 
Egypt • 2. Division A
24 Sep - 15:30
FC MASAR
0.45
DRAW
2.65
PROXY SC
6
North Macedonia
FK MOGILA vs FK ARSIMI 1973

more 
North Macedonia • Macedonia Cup
24 Sep - 15:30
FK MOGILA
21
DRAW
11
FK ARSIMI 1973
0.009
Egypt
TEAM FC CAIRO vs EL DAKHLEYA SC

more 
Egypt • 2. Division A
24 Sep - 15:30
TEAM FC CAIRO
1.1
DRAW
1.75
EL DAKHLEYA SC
2.45
Israel
Hapoel Jerusalem (W) vs Maccabi Kiryat Gat (W)

more 
Israel • Israel Division 1 Women
24 Sep - 15:30
Hapoel Jerusalem (W)
1.25
Draw
2.4
Maccabi Kiryat Gat (W)
1.69
Israel
MACCABI NUJEIDAT AHMAD vs HAPOEL IRONI ARRABA

more 
Israel • Liga Alef
24 Sep - 15:30
MACCABI NUJEIDAT AHMAD
0.8
DRAW
2.55
HAPOEL IRONI ARRABA
2.65
Egypt
MALEYAT KAFR EL ZAYAT vs EL MANSURAH

more 
Egypt • 2. Division A
24 Sep - 15:30
MALEYAT KAFR EL ZAYAT
1.25
DRAW
1.6
EL MANSURAH
2.35
Egypt
KAHRABAA ISMAILIA vs PHARCO FC

more 
Egypt • 2. Division A
24 Sep - 15:30
KAHRABAA ISMAILIA
1.08
DRAW
1.6
PHARCO FC
2.9
Israel
Hapoel Tel Aviv (W) vs Hapoel Raanana (W)

more 
Israel • Israel Division 1 Women
24 Sep - 15:30
Hapoel Tel Aviv (W)
1.5
Draw
2.45
Hapoel Raanana (W)
1.35
Egypt
AL NASR CAIRO vs EL SEKKA EL HADID

more 
Egypt • 2. Division A
24 Sep - 15:30
AL NASR CAIRO
1.2
DRAW
1.9
EL SEKKA EL HADID
2.1
Slovakia
FK PODKONICE vs MFK RUZOMBEROK B

more 
Slovakia • 3. Liga
24 Sep - 15:30
FK PODKONICE
2.15
DRAW
2.15
MFK RUZOMBEROK B
1.08
United Arab Emirates
Al Jazira U21 Vs Al Orooba U21

more 
United Arab Emirates • United Arab Emirates League U21
24 Sep - 15:30
Al Jazira U21
0.3
Draw
3.9
Al Orooba U21
5.7
Qatar
Umm Salal U20 vs Al Markhiya U20

more 
Qatar • Qatar League U20
24 Sep - 15:45
Umm Salal U20
1.1
Draw
2.7
Al Markhiya U20
1.7
Qatar
Al Gharafa U20 vs Al-Khor SC U20

more 
Qatar • Qatar League U20
24 Sep - 15:45
Al Gharafa U20
0.4
Draw
3
Al-Khor SC U20
5.2
Estonia
FC ELVA vs JK TALLINNA KALEV

more 
Estonia • Cup
24 Sep - 16:00
FC ELVA
1.75
DRAW
2.35
JK TALLINNA KALEV
1.2
International Youth
ROMANIA vs HUNGARY

more 
International Youth • U19 Friendly Games
24 Sep - 16:00
ROMANIA
0.95
DRAW
2.5
HUNGARY
2.15
International Youth
SERBIA vs BULGARIA

more 
International Youth • U19 Friendly Games
24 Sep - 16:00
SERBIA
0.85
DRAW
2.4
BULGARIA
2.55
Argentina
Talleres Remedios (R) Vs CA San Miguel (R)

more 
Argentina • Argentina Reserve League
24 Sep - 16:00
Talleres Remedios (R)
0.95
Draw
2.2
CA San Miguel (R)
2.4
Oman
Oman Vs Sur

more 
Oman • Oman Federation Cup
24 Sep - 16:30
Oman
2.6
Draw
2.25
Sur
0.85
Oman
Sohar Club Vs Seeb

more 
Oman • Oman Federation Cup
24 Sep - 16:40
Sohar Club
1.2
Draw
2
Seeb
2
Qatar
Al-Sadd SC U20 vs Al Mesaimeer SC U20

more 
Qatar • Qatar League U20
24 Sep - 16:45
Al-Sadd SC U20
0.7
Draw
3
Al Mesaimeer SC U20
2.45
Argentina
Nueva Chicago (R) vs Club Atletico Mitre (R)

more 
Argentina • Argentina Reserve League
24 Sep - 17:00
Nueva Chicago (R)
1.09
Draw
2.15
Club Atletico Mitre (R)
2.15
Croatia
NK KOPRIVNICA vs NK USKOK

more 
Croatia • Druga NL
24 Sep - 17:00
NK KOPRIVNICA
1.75
DRAW
2.5
NK USKOK
1.2
Argentina
Agropecuario (R) Vs CA Colegiales (R)

more 
Argentina • Argentina Reserve League
24 Sep - 17:00
Agropecuario (R)
0.12
Draw
6
CA Colegiales (R)
10.6
Argentina
Almagro (R) vs Almirante Brown (R)

more 
Argentina • Argentina Reserve League
24 Sep - 17:00
Almagro (R)
0.9
Draw
2
Almirante Brown (R)
2.7
Argentina
Club Atletico Atlanta (R) vs All Boys (R)

more 
Argentina • Argentina Reserve League
24 Sep - 17:00
Club Atletico Atlanta (R)
1.12
Draw
2
All Boys (R)
2.15
Nigeria
RIVERS UNITED FC vs KUN KHALIFAT FC

more 
Nigeria • Premier League
24 Sep - 17:00
RIVERS UNITED FC
0.22
DRAW
5
KUN KHALIFAT FC
8
Finland
JYTY TURKU vs ABO CLUB DE FUTBOL

more 
Finland • Kolmonen
24 Sep - 17:15
JYTY TURKU
0.5
DRAW
3.3
ABO CLUB DE FUTBOL
4
Israel
SC Ramla Vs Ironi Kiryat Gat

more 
Israel • Israel Liga Bet
24 Sep - 17:30
SC Ramla
0.25
Draw
4.2
Ironi Kiryat Gat
6.8
Israel
MK Tzofi Haifa Vs Tzeirey Haifa SC

more 
Israel • Israel Liga Bet
24 Sep - 17:30
MK Tzofi Haifa
1.65
Draw
2.9
Tzeirey Haifa SC
1.09
International
UNITED ARAB EMIRATES vs YEMEN

more 
International • Gulf Cup
24 Sep - 17:55
UNITED ARAB EMIRATES
0.25
DRAW
3.9
YEMEN
9
Qatar
Al-Arabi Doha U20 vs Al Duhail U20

more 
Qatar • Qatar League U20
24 Sep - 17:55
Al-Arabi Doha U20
0.55
Draw
3
Al Duhail U20
3.2
Qatar
Al-Wakrah SC U20 vs Qatar SC Doha U20

more 
Qatar • Qatar League U20
24 Sep - 17:55
Al-Wakrah SC U20
2.55
Draw
2.15
Qatar SC Doha U20
0.95
Israel
MACCABI HERZLIYA vs MS FOOTBALL HAPOEL KIRYAT YAM

more 
Israel • National League
24 Sep - 18:00
MACCABI HERZLIYA
1.65
DRAW
2.05
MS FOOTBALL HAPOEL KIRYAT YAM
1.45
Finland
FC KONTU vs LPS LAAJASALON

more 
Finland • Kolmonen
24 Sep - 18:00
FC KONTU
2.25
DRAW
3.4
LPS LAAJASALON
0.75
Finland
EIF AKADEMI vs HOOGEE

more 
Finland • Kolmonen
24 Sep - 18:00
EIF AKADEMI
0.4
DRAW
4
HOOGEE
4.2
Jordan
AL-AHLY AMMAN vs MAAN SC

more 
Jordan • Jordan 1st Division
24 Sep - 18:00
AL-AHLY AMMAN
0.6
DRAW
2.65
MAAN SC
3.9
Israel
IRONI MODIIN vs MS ASHDOD

more 
Israel • National League
24 Sep - 18:00
IRONI MODIIN
5.8
DRAW
3.3
MS ASHDOD
0.4
Finland
LAUTP/2 vs KULTSU FC

more 
Finland • Kolmonen
24 Sep - 18:00
LAUTP/2
15
DRAW
10
KULTSU FC
0.08
Israel
FC JERUSALEM vs MACCABI Y.

more 
Israel • Liga Alef
24 Sep - 18:00
FC JERUSALEM
0.95
DRAW
2.3
MACCABI Y.
2.35
Israel
HAPOEL ACRE FC vs HAPOEL AFULA FC

more 
Israel • National League
24 Sep - 18:00
HAPOEL ACRE FC
3.6
DRAW
2.6
HAPOEL AFULA FC
0.65
Jordan
SAHL HORAN SC vs HAY AL AMIR HASSAN

more 
Jordan • Jordan 1st Division
24 Sep - 18:00
SAHL HORAN SC
1.2
DRAW
1.95
HAY AL AMIR HASSAN
2.2
Jordan
Nashama Al-Mustaqbal (W) vs Al Orthodoxi (W)

more 
Jordan • Jordan Jordan League Women
24 Sep - 18:00
Nashama Al-Mustaqbal (W)
1
Draw
2.6
Al Orthodoxi (W)
1.9
Israel
HAPOEL RISHON LEZION FC vs MACCABI ACHI NAZARETH FC

more 
Israel • National League
24 Sep - 18:00
HAPOEL RISHON LEZION FC
0.55
DRAW
2.85
MACCABI ACHI NAZARETH FC
3.9
Israel
HAPOEL MIGDAL HAEMEQ vs HAPOEL NOF HAGALIL FC

more 
Israel • Liga Alef
24 Sep - 18:30
HAPOEL MIGDAL HAEMEQ
1.95
DRAW
2
HAPOEL NOF HAGALIL FC
1.25
Norway
Grorud U19 Vs Valerenga U19

more 
Norway • Norway Elite League U19
24 Sep - 18:30
Grorud U19
0.35
Draw
4.4
Valerenga U19
4.1
Finland
PPJ/LAUTTASAARI vs PAKKALAN PALLOSEURA

more 
Finland • Kolmonen
24 Sep - 19:00
PPJ/LAUTTASAARI
0.08
DRAW
10
PAKKALAN PALLOSEURA
15
Finland
FISH UNITED vs SAAKSJAERVEN LOISKE

more 
Finland • Kolmonen
24 Sep - 19:00
FISH UNITED
1.9
DRAW
2.6
SAAKSJAERVEN LOISKE
1.06
Finland
Toukolan Teras U21 Vs Rips HyPS Yj U21

more 
Finland • Finland League U21
24 Sep - 19:00
Toukolan Teras U21
0.5
Draw
3.7
Rips HyPS Yj U21
3
Israel
Shicun Hamizrah vs Bnei Eilat

more 
Israel • Israel Liga Bet
24 Sep - 19:00
Shicun Hamizrah
1.45
Draw
2.7
Bnei Eilat
1.27
Israel
HAPOEL HADERA FC vs MACCABI IRONI ASHDOD FC

more 
Israel • Liga Alef
24 Sep - 19:15
HAPOEL HADERA FC
0.7
DRAW
2.5
MACCABI IRONI ASHDOD FC
3.2
Finland
MPS vs SEXYPOXYT

more 
Finland • Kolmonen
24 Sep - 19:30
MPS
1.05
DRAW
2.75
SEXYPOXYT
1.8
Israel
Ihud Bnei Baqa Vs Hapoel Bnei Arrara Ara

more 
Israel • Israel Liga Bet
24 Sep - 19:30
Ihud Bnei Baqa
0.35
Draw
3.4
Hapoel Bnei Arrara Ara
5.5
Israel
Hapoel Ironi Hod Hasharon Vs Hapoel Kafr Qasim Sho

more 
Israel • Israel Liga Bet
24 Sep - 19:30
Hapoel Ironi Hod Hasharon
0.65
Draw
2.9
Hapoel Kafr Qasim Shouaa
2.7
Israel
Beitar Haifa Yakov Vs FC Kababir

more 
Israel • Israel Liga Bet
24 Sep - 19:45
Beitar Haifa Yakov
0.12
Draw
5.9
FC Kababir
11.7
Argentina
NEWELLS OLD BOYS vs ROSARIO CENTRAL RESERVE

more 
Argentina • Liga Profesional, Reserves
24 Sep - 20:00
NEWELLS OLD BOYS
1.08
DRAW
2.15
ROSARIO CENTRAL RESERVE
2.15
International
QATAR vs BAHRAIN

more 
International • Gulf Cup
24 Sep - 20:00
QATAR
1.04
DRAW
1.8
BAHRAIN
2.6
Argentina
Temperley (R) vs Ferrocarril Midland (R)

more 
Argentina • Argentina Reserve League
24 Sep - 20:00
Temperley (R)
0.12
Draw
5.2
Ferrocarril Midland (R)
14.5
Argentina
INSTITUTO AC CORDOBA RESERVES vs ESTUDIANTES DE RIO CUARTO RESERVE

more 
Argentina • Liga Profesional, Reserves
24 Sep - 20:00
INSTITUTO AC CORDOBA RESERVES
0.75
DRAW
2.1
ESTUDIANTES DE RIO CUARTO RESERVE
3.6
Argentina
ARGENTINOS JUNIORS RESERVE vs CA PLATENSE

more 
Argentina • Liga Profesional, Reserves
24 Sep - 20:00
ARGENTINOS JUNIORS RESERVE
0.8
DRAW
2.05
CA PLATENSE
3.4
Brazil
ASSOCIACAO PORTUGUESA DE DESPORTOS SP vs AA PONTE PRETA SP

more 
Brazil • U20 Paulista
24 Sep - 20:00
ASSOCIACAO PORTUGUESA DE DESPORTOS SP
0.6
DRAW
2.9
AA PONTE PRETA SP
3.3
Argentina
Sacachispas (R) vs General Lamadrid (R)

more 
Argentina • Argentina Primera C Metropolitana Reserves
24 Sep - 20:00
Sacachispas (R)
0.7
Draw
2.45
General Lamadrid (R)
3.15
Argentina
DEPORTIVO RIESTRA AFBC RESERVE vs CA BARRACAS CENTRAL RESERVE

more 
Argentina • Liga Profesional, Reserves
24 Sep - 20:00
DEPORTIVO RIESTRA AFBC RESERVE
0.85
DRAW
1.95
CA BARRACAS CENTRAL RESERVE
3.1
International Youth
BELGIUM vs BELARUS

more 
International Youth • U21 Euro Qualification
24 Sep - 20:00
BELGIUM
0.2
DRAW
4.6
BELARUS
11
Israel
Maccabi Beer Sheva Vs Maccabi Ashkelon

more 
Israel • Israel Liga Bet
24 Sep - 20:00
Maccabi Beer Sheva
1.1
Draw
2.9
Maccabi Ashkelon
1.6
Israel
FC Hapoel Bnei Ashdod Vs Ihud Tzeirey Abu Gosh

more 
Israel • Israel Liga Bet
24 Sep - 20:00
FC Hapoel Bnei Ashdod
0.85
Draw
2.9
Ihud Tzeirey Abu Gosh
2
Israel
Maccabi Ironi Kfar Yona FC Vs Hapoel Ramot Menashe

more 
Israel • Israel Liga Bet
24 Sep - 20:00
Maccabi Ironi Kfar Yona FC
0.65
Draw
3.15
Hapoel Ramot Menashe Megiddo
2.6
Sweden
IK KONGAHALLA vs LINDOME GIF

more 
Sweden • Division 2, Promotion Playoffs
24 Sep - 20:15
IK KONGAHALLA
1.2
DRAW
2.7
LINDOME GIF
1.55
Switzerland
Saint Blaise vs FC Bosna Neuchatel

more 
Switzerland • Switzerland 2 Liga Interregional
24 Sep - 20:15
Saint Blaise
2.9
Draw
2.8
FC Bosna Neuchatel
0.65
Switzerland
FC Bole vs FC Champagne Sport

more 
Switzerland • Switzerland 2 Liga Interregional
24 Sep - 20:15
FC Bole
3.15
Draw
2.9
FC Champagne Sport
0.6
Norway
Follo U19 Vs Lillehammer U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
Follo U19
0.45
Draw
3.9
Lillehammer U19
3.4
Norway
Ready U19 Vs Skedsmo U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
Ready U19
0.85
Draw
3.55
Skedsmo U19
1.8
Norway
Skeid U19 Vs Ullensaker/Kisa U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
Skeid U19
0.01
Draw
12
Ullensaker/Kisa U19
27
Norway
Christiania BK U19 Vs Gjoevik-Lyn U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
Christiania BK U19
0.01
Draw
11
Gjoevik-Lyn U19
27
Norway
KFUM U19 Vs Nordstrand U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
KFUM U19
0.22
Draw
5.5
Nordstrand U19
6.1
Norway
B?rum U19 vs Ullern U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
B?rum U19
1.12
Draw
3.55
Ullern U19
1.35
Norway
Sprint Jeloy U19 Vs Sarpsborg FK U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
Sprint Jeloy U19
0.4
Draw
4.4
Sarpsborg FK U19
3.7
Norway
Haslum U19 Vs Asker U19

more 
Norway • Norway Elite League U19
24 Sep - 20:15
Haslum U19
0.45
Draw
4.4
Asker U19
2.9
International Youth
SAN MARINO vs KOSOVO

more 
International Youth • U21 Euro Qualification
24 Sep - 20:30
SAN MARINO
39
DRAW
16
KOSOVO
0.02
Uruguay
MONTEVIDEO CITY TORQUE vs SAN CARLOS

more 
Uruguay • Copa Uruguay
24 Sep - 20:30
MONTEVIDEO CITY TORQUE
0.5
DRAW
2.7
SAN CARLOS
4.8
Uruguay
DANUBIO vs PENAROL

more 
Uruguay • Copa Uruguay
24 Sep - 20:30
DANUBIO
2.65
DRAW
2
PENAROL
0.95
Norway
Lorenskog U19 Vs Kjelsas U19

more 
Norway • Norway Elite League U19
24 Sep - 20:30
Lorenskog U19
4.3
Draw
4.8
Kjelsas U19
0.33
Norway
Raelingen U19 Vs Gjelleraasen U19

more 
Norway • Norway Elite League U19
24 Sep - 20:30
Raelingen U19
13.5
Draw
10.6
Gjelleraasen U19
0.05
England
Boldmere St Michaels (W) vs Sutton Coldfield (W)

more 
England • England Nacional League Cup Women
24 Sep - 20:45
Boldmere St Michaels (W)
0.08
Draw
6.9
Sutton Coldfield (W)
15.5
France
CAEN vs FC ROUEN

more 
France • National
24 Sep - 20:45
CAEN
1.75
DRAW
1.9
FC ROUEN
1.45
Ecuador
ATLETICO ROJIBLANCO vs CLUB DEPORTIVO CUENCA JUNIORS

more 
Ecuador • LigaPro Primera B
24 Sep - 21:00
ATLETICO ROJIBLANCO
0.85
DRAW
1.85
CLUB DEPORTIVO CUENCA JUNIORS
3.3
Paraguay
CA TEMBETARY YPANE vs SPORTIVO ITENO

more 
Paraguay • Copa Paraguay
24 Sep - 21:00
CA TEMBETARY YPANE
0.4
DRAW
3.2
SPORTIVO ITENO
5
International
PUERTO RICO vs GUYANA

more 
International • CONCACAF Nations League
24 Sep - 21:00
PUERTO RICO
1.95
DRAW
2
GUYANA
1.25
Argentina
Sarmiento de Zonda vs Union Villa Krause

more 
Argentina • Argentina Torneo Regional Amateur
24 Sep - 21:30
Sarmiento de Zonda
3
Draw
2.7
Union Villa Krause
0.65
Morocco
UNION SPORTIF AMAL TIZNIT vs ITTIHAD TANGER

more 
Morocco • Botola
24 Sep - 22:00
UNION SPORTIF AMAL TIZNIT
2.5
DRAW
2
ITTIHAD TANGER
1.1
El Salvador
CD AUDAZ vs CD DRAGON

more 
El Salvador • Segunda Division
24 Sep - 22:30
CD AUDAZ
1.3
DRAW
2
CD DRAGON
1.9
Ecuador
CD INDEPENDIENTE JUNIORS vs VINOTINTO FC ECUADOR

more 
Ecuador • LigaPro Primera B
24 Sep - 22:30
CD INDEPENDIENTE JUNIORS
1.1
DRAW
1.85
VINOTINTO FC ECUADOR
2.4
Chile
OHIGGINS vs CD SANTA CRUZ

more 
Chile • Copa Chile
24 Sep - 23:00
OHIGGINS
0.6
DRAW
2.55
CD SANTA CRUZ
3.9
Panama
TAURO FC II vs AF SPORTING SAN MIGUELITO II

more 
Panama • Liga Prom
24 Sep - 23:00
TAURO FC II
1.25
DRAW
2.05
AF SPORTING SAN MIGUELITO II
1.9
Honduras
CD Marathon (R) Vs CD Olimpia (R)

more 
Honduras • Honduras Reserve League
24 Sep - 23:00
CD Marathon (R)
1.4
Draw
2.45
CD Olimpia (R)
1.4
Ecuador
LDU PORTOVIEJO vs 22 DE JULIO

more 
Ecuador • LigaPro Primera B
24 Sep - 23:30
LDU PORTOVIEJO
0.22
DRAW
4
22 DE JULIO
11
Paraguay
RECOLETA FC vs GUAIRENA FC

more 
Paraguay • Copa Paraguay
24 Sep - 23:30`;

const parsed = parseHollywoodbetsRawText(rawText);
console.log(`Parsed ${parsed.length} fixtures.`);

// Check Al-Sadd fixture specifically
const alSadd = parsed.find(f => f.homeTeam.name.includes('Al-Sadd'));
if (alSadd) {
  console.log('Al-Sadd fixture verified:', {
    match: `${alSadd.homeTeam.name} vs ${alSadd.awayTeam.name}`,
    league: alSadd.league,
    kickoffTime: alSadd.kickoffTime,
    odds: alSadd.odds
  });
}

const fixturesFilePath = path.join(__dirname, '..', 'src', 'data', 'upcoming_fixtures.json');
let existing = [];
try {
  existing = JSON.parse(fs.readFileSync(fixturesFilePath, 'utf8'));
} catch (e) {
  console.warn('Could not read existing fixtures');
}

// Keep older valid fixtures not in this batch, and update/overwrite Hollywoodbets 24 Sep ones
const nonToday = existing.filter(f => !f.id.startsWith('hollywoodbets_20260924_'));
const merged = [...parsed, ...nonToday];
merged.sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());

fs.writeFileSync(fixturesFilePath, JSON.stringify(merged, null, 2), 'utf8');
console.log(`Saved ${merged.length} fixtures to ${fixturesFilePath}`);
