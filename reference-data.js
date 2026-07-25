// reference-data.js
// Автокомплит городов и авиакомпаний. Использует публичный автокомплит-сервис
// Travelpayouts (не требует токена) плюс статический справочник авиакомпаний.

window.ReferenceData = (function () {
  const AUTOCOMPLETE_URL = "https://autocomplete.travelpayouts.com/places2";
  const AIRLINES_URL = "https://api.travelpayouts.com/data/ru/airlines.json";

  // Переводит двухбуквенный ISO-код страны в эмодзи-флаг.
  function countryCodeToFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return "";
    const OFFSET = 127397; // 0x1F1E6 - 'A'.charCodeAt(0)
    return String.fromCodePoint(
      ...countryCode
        .toUpperCase()
        .split("")
        .map((c) => c.charCodeAt(0) + OFFSET)
    );
  }

  // Пытается получить JSON напрямую; если браузер блокирует запрос (CORS) -
  // пробует через публичный прокси allorigins.win. Логирует в консоль, чтобы
  // при отладке было видно, что именно произошло.
  async function fetchJsonWithCorsFallback(url, label) {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      console.warn(`[${label}] прямой запрос не прошёл (похоже на CORS), пробую через прокси`, err);
    }

    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) return null;
      return await response.json();
    } catch (proxyErr) {
      console.error(`[${label}] и прокси тоже не сработал`, proxyErr);
      return null;
    }
  }

  // Поиск городов по названию (любой язык, любая часть слова).
  async function searchCities(term) {
    if (!term || term.trim().length < 2) return [];

    const params = new URLSearchParams({
      term: term.trim(),
      locale: "ru",
    });
    params.append("types[]", "city");
    params.append("types[]", "airport");

    const data = await fetchJsonWithCorsFallback(
      `${AUTOCOMPLETE_URL}?${params.toString()}`,
      "автокомплит городов"
    );

    if (!Array.isArray(data)) return [];

    return data
      .filter((item) => item.code) // только записи с IATA-кодом
      .slice(0, 8)
      .map((item) => ({
        code: item.code,
        name: item.name,
        countryName: item.country_name || "",
        countryCode: item.country_code || "",
        flag: countryCodeToFlag(item.country_code),
        type: item.type,
      }));
  }

  // Справочник авиакомпаний загружается один раз и кэшируется в памяти.
  let airlinesCache = null;
  let airlinesLoadingPromise = null;

  async function loadAirlines() {
    if (airlinesCache) return airlinesCache;
    if (airlinesLoadingPromise) return airlinesLoadingPromise;

    airlinesLoadingPromise = fetchJsonWithCorsFallback(AIRLINES_URL, "справочник авиакомпаний").then(
      (list) => {
        airlinesCache = Array.isArray(list)
          ? list.filter((a) => a.iata && a.name)
          : [];
        return airlinesCache;
      }
    );

    return airlinesLoadingPromise;
  }

  async function searchAirlines(term) {
    if (!term || term.trim().length < 2) return [];
    const list = await loadAirlines();
    const q = term.trim().toLowerCase();
    return list
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((a) => ({ code: a.iata, name: a.name }));
  }

  return { searchCities, searchAirlines, countryCodeToFlag, loadAirlines };
})();
