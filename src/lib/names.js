// Generation pools: player names, towns, mascots, team color pairs, coach
// surnames. Kept broad enough that a 12-team league of 144 players feels varied.

const FIRST_NAMES = [
  'Jaylen', 'Marcus', 'Tyree', 'Devin', 'Cameron', 'Isaiah', 'Elijah', 'Mason',
  'Carter', 'Bryce', 'Trey', 'Darius', 'Malik', 'Xavier', 'Jordan', 'Caleb',
  'Aiden', 'Brandon', 'Damon', 'Quincy', 'Andre', 'Terrell', 'Dominic', 'Khalil',
  'Jamal', 'Reggie', 'Donovan', 'Keenan', 'Marquise', 'Tobias', 'Nico', 'Levi',
  'Hunter', 'Cole', 'Owen', 'Gavin', 'Silas', 'Amari', 'Zion', 'Kobe',
  'DeShawn', 'Tyson', 'Maddox', 'Roman', 'Julian', 'Antoine', 'Rashad', 'Demarco',
  'Beckett', 'Easton', 'Jaxon', 'Kyrie', 'Lamar', 'Micah', 'Naseer', 'Omari',
];

const LAST_NAMES = [
  'Carter', 'Johnson', 'Williams', 'Brooks', 'Hayes', 'Coleman', 'Bryant',
  'Mitchell', 'Robinson', 'Sanders', 'Bell', 'Foster', 'Greene', 'Hill',
  'Jenkins', 'Parker', 'Reed', 'Turner', 'Walker', 'Ward', 'Watkins', 'Young',
  'Adkins', 'Barnes', 'Cross', 'Dunn', 'Ellis', 'Fields', 'Grant', 'Holt',
  'Ingram', 'Joyner', 'Knight', 'Lyles', 'Mack', 'Nash', 'Oden', 'Pryor',
  'Quick', 'Raines', 'Stokes', 'Tatum', 'Vance', 'Wade', 'Akins', 'Boone',
  'Cannon', 'Dial', 'Easley', 'Frye', 'Gantt', 'Hardaway', 'Iverson', 'Jett',
];

const CITY_NAMES = [
  'Riverton', 'Oak Hill', 'Maple Grove', 'Fairview', 'Cedar Falls', 'Lakeside',
  'Springdale', 'Northgate', 'Westbrook', 'Eastvale', 'Clearwater', 'Stonebridge',
  'Hillcrest', 'Brookfield', 'Ridgeway', 'Pinewood', 'Glenwood', 'Sunset Park',
  'Harbor City', 'Mill Valley', 'Crestmont', 'Granite Bay', 'Ironwood', 'Belmont',
];

const MASCOTS = [
  'Hawks', 'Wolves', 'Tigers', 'Eagles', 'Panthers', 'Bears', 'Cougars',
  'Falcons', 'Bulldogs', 'Vikings', 'Spartans', 'Knights', 'Raiders', 'Titans',
  'Lions', 'Rams', 'Mustangs', 'Hornets', 'Jaguars', 'Wildcats', 'Storm',
  'Thunder', 'Comets', 'Dragons',
];

const COACH_SURNAMES = [
  'Holloway', 'Pruitt', 'Maddox', 'Whitfield', 'Castellano', 'Brennan',
  'Okafor', 'Delgado', 'Ferraro', 'Schubert', 'Vinson', 'Ashby', 'Calloway',
  'Drummond', 'Espinoza', 'Lindqvist', 'McAllister', 'Renner', 'Sato', 'Tran',
];

const COACH_FIRST = [
  'Ray', 'Sam', 'Vic', 'Lou', 'Hank', 'Carl', 'Dean', 'Gus', 'Roy', 'Pete',
  'Earl', 'Phil', 'Stan', 'Walt', 'Frank', 'Joe', 'Marv', 'Chuck', 'Don', 'Al',
];

// [primary, secondary] hex pairs — each visually distinct, high contrast.
const COLOR_PAIRS = [
  ['#C0392B', '#2C3E50'], // crimson / slate
  ['#1F618D', '#F4D03F'], // blue / gold
  ['#196F3D', '#F2F4F7'], // forest / white
  ['#6C3483', '#F39C12'], // purple / orange
  ['#922B21', '#D5D8DC'], // maroon / silver
  ['#0E6655', '#F7DC6F'], // teal / gold
  ['#1B4F72', '#E67E22'], // navy / orange
  ['#7B241C', '#27AE60'], // brick / green
  ['#283747', '#5DADE2'], // charcoal / sky
  ['#B7950B', '#1C2833'], // mustard / black
  ['#A93226', '#117A65'], // red / teal
  ['#2E4053', '#E74C3C'], // steel / red
  ['#4A235A', '#48C9B0'], // grape / mint
  ['#784212', '#F8C471'], // bronze / sand
  ['#0B5345', '#EC7063'], // pine / coral
  ['#212F3D', '#F1C40F'], // ink / yellow
];

// Strength/weakness descriptor banks, keyed by attribute, for recruit blurbs.
const ATTR_LABELS = {
  shooting: 'Shooting',
  finishing: 'Finishing',
  passing: 'Playmaking',
  defense: 'Defense',
  rebounding: 'Rebounding',
  athleticism: 'Athleticism',
};

module.exports = {
  FIRST_NAMES, LAST_NAMES, CITY_NAMES, MASCOTS,
  COACH_SURNAMES, COACH_FIRST, COLOR_PAIRS, ATTR_LABELS,
};
