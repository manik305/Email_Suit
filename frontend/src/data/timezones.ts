// All world timezones with country labels, grouped by region
// Format: { value: IANA_tz, label: "Country — City (UTC±X)" }

export interface TzOption {
  value: string;
  label: string;
  region: string;
}

export const ALL_TIMEZONES: TzOption[] = [
  // ── UTC ───────────────────────────────────────────────────────────────────
  { region: "UTC", value: "UTC", label: "UTC — Coordinated Universal Time (UTC+0)" },

  // ── US & Canada ──────────────────────────────────────────────────────────
  { region: "US & Canada", value: "America/New_York",    label: "USA — New York / Eastern (UTC-5/-4)" },
  { region: "US & Canada", value: "America/Chicago",     label: "USA — Chicago / Central (UTC-6/-5)" },
  { region: "US & Canada", value: "America/Denver",      label: "USA — Denver / Mountain (UTC-7/-6)" },
  { region: "US & Canada", value: "America/Phoenix",     label: "USA — Phoenix / MST no DST (UTC-7)" },
  { region: "US & Canada", value: "America/Los_Angeles", label: "USA — Los Angeles / Pacific (UTC-8/-7)" },
  { region: "US & Canada", value: "America/Anchorage",   label: "USA — Anchorage / Alaska (UTC-9/-8)" },
  { region: "US & Canada", value: "Pacific/Honolulu",    label: "USA — Honolulu / Hawaii (UTC-10)" },
  { region: "US & Canada", value: "America/Toronto",     label: "Canada — Toronto / Eastern (UTC-5/-4)" },
  { region: "US & Canada", value: "America/Vancouver",   label: "Canada — Vancouver / Pacific (UTC-8/-7)" },
  { region: "US & Canada", value: "America/Winnipeg",    label: "Canada — Winnipeg / Central (UTC-6/-5)" },
  { region: "US & Canada", value: "America/Halifax",     label: "Canada — Halifax / Atlantic (UTC-4/-3)" },
  { region: "US & Canada", value: "America/St_Johns",    label: "Canada — St. John's / Newfoundland (UTC-3:30)" },

  // ── Latin America ─────────────────────────────────────────────────────────
  { region: "Latin America", value: "America/Mexico_City",     label: "Mexico — Mexico City (UTC-6/-5)" },
  { region: "Latin America", value: "America/Tijuana",         label: "Mexico — Tijuana (UTC-8/-7)" },
  { region: "Latin America", value: "America/Guatemala",       label: "Guatemala (UTC-6)" },
  { region: "Latin America", value: "America/El_Salvador",     label: "El Salvador (UTC-6)" },
  { region: "Latin America", value: "America/Costa_Rica",      label: "Costa Rica (UTC-6)" },
  { region: "Latin America", value: "America/Panama",          label: "Panama (UTC-5)" },
  { region: "Latin America", value: "America/Havana",          label: "Cuba — Havana (UTC-5/-4)" },
  { region: "Latin America", value: "America/Bogota",          label: "Colombia — Bogotá (UTC-5)" },
  { region: "Latin America", value: "America/Lima",            label: "Peru — Lima (UTC-5)" },
  { region: "Latin America", value: "America/Guayaquil",       label: "Ecuador — Guayaquil (UTC-5)" },
  { region: "Latin America", value: "America/Caracas",         label: "Venezuela — Caracas (UTC-4)" },
  { region: "Latin America", value: "America/La_Paz",          label: "Bolivia — La Paz (UTC-4)" },
  { region: "Latin America", value: "America/Santiago",        label: "Chile — Santiago (UTC-4/-3)" },
  { region: "Latin America", value: "America/Asuncion",        label: "Paraguay — Asunción (UTC-4/-3)" },
  { region: "Latin America", value: "America/Argentina/Buenos_Aires", label: "Argentina — Buenos Aires (UTC-3)" },
  { region: "Latin America", value: "America/Sao_Paulo",       label: "Brazil — São Paulo (UTC-3/-2)" },
  { region: "Latin America", value: "America/Manaus",          label: "Brazil — Manaus (UTC-4)" },
  { region: "Latin America", value: "America/Noronha",         label: "Brazil — Fernando de Noronha (UTC-2)" },
  { region: "Latin America", value: "America/Montevideo",      label: "Uruguay — Montevideo (UTC-3/-2)" },
  { region: "Latin America", value: "America/Cayenne",         label: "French Guiana — Cayenne (UTC-3)" },
  { region: "Latin America", value: "America/Paramaribo",      label: "Suriname — Paramaribo (UTC-3)" },

  // ── Europe ────────────────────────────────────────────────────────────────
  { region: "Europe", value: "Europe/London",     label: "UK — London / GMT (UTC+0/+1)" },
  { region: "Europe", value: "Europe/Dublin",     label: "Ireland — Dublin (UTC+0/+1)" },
  { region: "Europe", value: "Europe/Lisbon",     label: "Portugal — Lisbon (UTC+0/+1)" },
  { region: "Europe", value: "Atlantic/Reykjavik",label: "Iceland — Reykjavik (UTC+0)" },
  { region: "Europe", value: "Europe/Paris",      label: "France — Paris / CET (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Berlin",     label: "Germany — Berlin (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Madrid",     label: "Spain — Madrid (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Rome",       label: "Italy — Rome (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Amsterdam",  label: "Netherlands — Amsterdam (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Brussels",   label: "Belgium — Brussels (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Zurich",     label: "Switzerland — Zurich (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Vienna",     label: "Austria — Vienna (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Warsaw",     label: "Poland — Warsaw (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Prague",     label: "Czech Republic — Prague (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Budapest",   label: "Hungary — Budapest (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Stockholm",  label: "Sweden — Stockholm (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Oslo",       label: "Norway — Oslo (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Copenhagen", label: "Denmark — Copenhagen (UTC+1/+2)" },
  { region: "Europe", value: "Europe/Helsinki",   label: "Finland — Helsinki (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Riga",       label: "Latvia — Riga (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Tallinn",    label: "Estonia — Tallinn (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Vilnius",    label: "Lithuania — Vilnius (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Athens",     label: "Greece — Athens (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Bucharest",  label: "Romania — Bucharest (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Sofia",      label: "Bulgaria — Sofia (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Kiev",       label: "Ukraine — Kyiv (UTC+2/+3)" },
  { region: "Europe", value: "Europe/Minsk",      label: "Belarus — Minsk (UTC+3)" },
  { region: "Europe", value: "Europe/Moscow",     label: "Russia — Moscow (UTC+3)" },
  { region: "Europe", value: "Europe/Istanbul",   label: "Turkey — Istanbul (UTC+3)" },

  // ── Africa ────────────────────────────────────────────────────────────────
  { region: "Africa", value: "Africa/Casablanca",    label: "Morocco — Casablanca (UTC+1)" },
  { region: "Africa", value: "Africa/Algiers",       label: "Algeria — Algiers (UTC+1)" },
  { region: "Africa", value: "Africa/Tunis",         label: "Tunisia — Tunis (UTC+1)" },
  { region: "Africa", value: "Africa/Tripoli",       label: "Libya — Tripoli (UTC+2)" },
  { region: "Africa", value: "Africa/Cairo",         label: "Egypt — Cairo (UTC+2)" },
  { region: "Africa", value: "Africa/Khartoum",      label: "Sudan — Khartoum (UTC+3)" },
  { region: "Africa", value: "Africa/Addis_Ababa",   label: "Ethiopia — Addis Ababa (UTC+3)" },
  { region: "Africa", value: "Africa/Nairobi",       label: "Kenya — Nairobi (UTC+3)" },
  { region: "Africa", value: "Africa/Dar_es_Salaam", label: "Tanzania — Dar es Salaam (UTC+3)" },
  { region: "Africa", value: "Africa/Lagos",         label: "Nigeria — Lagos (UTC+1)" },
  { region: "Africa", value: "Africa/Accra",         label: "Ghana — Accra (UTC+0)" },
  { region: "Africa", value: "Africa/Dakar",         label: "Senegal — Dakar (UTC+0)" },
  { region: "Africa", value: "Africa/Johannesburg",  label: "South Africa — Johannesburg (UTC+2)" },
  { region: "Africa", value: "Africa/Harare",        label: "Zimbabwe — Harare (UTC+2)" },
  { region: "Africa", value: "Africa/Lusaka",        label: "Zambia — Lusaka (UTC+2)" },
  { region: "Africa", value: "Africa/Maputo",        label: "Mozambique — Maputo (UTC+2)" },
  { region: "Africa", value: "Africa/Kampala",       label: "Uganda — Kampala (UTC+3)" },
  { region: "Africa", value: "Africa/Mogadishu",     label: "Somalia — Mogadishu (UTC+3)" },
  { region: "Africa", value: "Indian/Mauritius",     label: "Mauritius (UTC+4)" },

  // ── Middle East ───────────────────────────────────────────────────────────
  { region: "Middle East", value: "Asia/Riyadh",   label: "Saudi Arabia — Riyadh (UTC+3)" },
  { region: "Middle East", value: "Asia/Dubai",    label: "UAE — Dubai (UTC+4)" },
  { region: "Middle East", value: "Asia/Qatar",    label: "Qatar — Doha (UTC+3)" },
  { region: "Middle East", value: "Asia/Kuwait",   label: "Kuwait City (UTC+3)" },
  { region: "Middle East", value: "Asia/Baghdad",  label: "Iraq — Baghdad (UTC+3)" },
  { region: "Middle East", value: "Asia/Tehran",   label: "Iran — Tehran (UTC+3:30)" },
  { region: "Middle East", value: "Asia/Beirut",   label: "Lebanon — Beirut (UTC+2/+3)" },
  { region: "Middle East", value: "Asia/Jerusalem",label: "Israel — Jerusalem (UTC+2/+3)" },
  { region: "Middle East", value: "Asia/Amman",    label: "Jordan — Amman (UTC+2/+3)" },
  { region: "Middle East", value: "Asia/Muscat",   label: "Oman — Muscat (UTC+4)" },
  { region: "Middle East", value: "Asia/Bahrain",  label: "Bahrain — Manama (UTC+3)" },
  { region: "Middle East", value: "Asia/Aden",     label: "Yemen — Aden (UTC+3)" },

  // ── South Asia ────────────────────────────────────────────────────────────
  { region: "South Asia", value: "Asia/Karachi",   label: "Pakistan — Karachi (UTC+5)" },
  { region: "South Asia", value: "Asia/Colombo",   label: "Sri Lanka — Colombo (UTC+5:30)" },
  { region: "South Asia", value: "Asia/Kolkata",   label: "India — Mumbai / Delhi (UTC+5:30)" },
  { region: "South Asia", value: "Asia/Kathmandu", label: "Nepal — Kathmandu (UTC+5:45)" },
  { region: "South Asia", value: "Asia/Dhaka",     label: "Bangladesh — Dhaka (UTC+6)" },
  { region: "South Asia", value: "Asia/Yangon",    label: "Myanmar — Yangon (UTC+6:30)" },

  // ── APAC — Southeast Asia ─────────────────────────────────────────────────
  { region: "APAC", value: "Asia/Bangkok",     label: "Thailand — Bangkok (UTC+7)" },
  { region: "APAC", value: "Asia/Jakarta",     label: "Indonesia — Jakarta / WIB (UTC+7)" },
  { region: "APAC", value: "Asia/Ho_Chi_Minh",label: "Vietnam — Ho Chi Minh City (UTC+7)" },
  { region: "APAC", value: "Asia/Phnom_Penh", label: "Cambodia — Phnom Penh (UTC+7)" },
  { region: "APAC", value: "Asia/Vientiane",  label: "Laos — Vientiane (UTC+7)" },
  { region: "APAC", value: "Asia/Kuala_Lumpur",label: "Malaysia — Kuala Lumpur (UTC+8)" },
  { region: "APAC", value: "Asia/Singapore",  label: "Singapore (UTC+8)" },
  { region: "APAC", value: "Asia/Manila",     label: "Philippines — Manila (UTC+8)" },
  { region: "APAC", value: "Asia/Taipei",     label: "Taiwan — Taipei (UTC+8)" },
  { region: "APAC", value: "Asia/Hong_Kong",  label: "Hong Kong (UTC+8)" },
  { region: "APAC", value: "Asia/Shanghai",   label: "China — Shanghai / Beijing (UTC+8)" },
  { region: "APAC", value: "Asia/Makassar",   label: "Indonesia — Makassar / WITA (UTC+8)" },
  { region: "APAC", value: "Asia/Seoul",      label: "South Korea — Seoul (UTC+9)" },
  { region: "APAC", value: "Asia/Tokyo",      label: "Japan — Tokyo (UTC+9)" },
  { region: "APAC", value: "Asia/Jayapura",   label: "Indonesia — Jayapura / WIT (UTC+9)" },
  { region: "APAC", value: "Australia/Perth",    label: "Australia — Perth / AWST (UTC+8)" },
  { region: "APAC", value: "Australia/Darwin",   label: "Australia — Darwin / ACST (UTC+9:30)" },
  { region: "APAC", value: "Australia/Adelaide", label: "Australia — Adelaide / ACST (UTC+9:30/+10:30)" },
  { region: "APAC", value: "Australia/Brisbane", label: "Australia — Brisbane / AEST (UTC+10)" },
  { region: "APAC", value: "Australia/Sydney",   label: "Australia — Sydney / AEDT (UTC+10/+11)" },
  { region: "APAC", value: "Pacific/Auckland",   label: "New Zealand — Auckland (UTC+12/+13)" },
  { region: "APAC", value: "Pacific/Fiji",       label: "Fiji (UTC+12)" },
  { region: "APAC", value: "Pacific/Guam",       label: "Guam (UTC+10)" },
];

export const TZ_REGIONS = ALL_TIMEZONES.map(t => t.region).filter((val, idx, self) => self.indexOf(val) === idx);

/** Convert a local datetime-local string + IANA timezone to UTC ISO string */
export function localToUtc(localDt: string, ianaZone: string): string {
  if (!localDt) return "";
  try {
    const [datePart, timePart] = localDt.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);

    const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(utcDate);
    const partMap: Record<string, string> = {};
    parts.forEach(p => { partMap[p.type] = p.value; });

    let fmtHour = Number(partMap.hour);
    if (fmtHour === 24) fmtHour = 0;

    const formattedLocal = new Date(Date.UTC(
      Number(partMap.year),
      Number(partMap.month) - 1,
      Number(partMap.day),
      fmtHour,
      Number(partMap.minute),
      Number(partMap.second)
    ));

    const offset = formattedLocal.getTime() - utcDate.getTime();
    return new Date(utcDate.getTime() - offset).toISOString();
  } catch (e) {
    console.error("Error converting local to UTC:", e);
    return new Date(localDt).toISOString();
  }
}

/** Convert a UTC ISO string to local datetime-local string ("YYYY-MM-DDTHH:mm") for a specific timezone */
export function utcToLocal(utcDt: string, ianaZone: string): string {
  if (!utcDt) return "";
  try {
    const date = new Date(utcDt);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    parts.forEach(p => { partMap[p.type] = p.value; });
    
    let fmtHour = partMap.hour;
    if (fmtHour === "24") fmtHour = "00";

    return `${partMap.year}-${partMap.month}-${partMap.day}T${fmtHour}:${partMap.minute}`;
  } catch {
    const d = new Date(utcDt);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
