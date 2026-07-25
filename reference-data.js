// reference-data.js
// Автокомплит городов и авиакомпаний. Использует публичный автокомплит-сервис
// Travelpayouts (не требует токена) плюс статический справочник авиакомпаний.

window.ReferenceData = (function () {
  const AUTOCOMPLETE_URL = "https://autocomplete.travelpayouts.com/places2";
  const AIRLINES_URL = "https://api.travelpayouts.com/data/ru/airlines.json";

  // Переводит двухбуквенный ISO-код страны в эмодзи-флаг.
  // Приём: буквы A-Z сдвигаются в диапазон региональных индикаторов Юникода.
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

  // Поиск городов по названию (любой язык, любая часть слова).
  async function searchCities(term) {
    if (!term || term.trim().length < 2) return [];

    const params = new URLSearchParams({
      term: term.trim(),
      locale: "ru",
    });
    params.append("types[]", "city");
    params.append("types[]", "airport");

    let response;
    try {
      response = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`);
    } catch (err) {
      return []; // тихо ничего не предлагаем, если сервис недоступен
    }

    if (!response.ok) return [];

    let data;
    try {
      data = await response.json();
    } catch (err) {
      return [];
    }

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

    airlinesLoadingPromise = fetch(AIRLINES_URL)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        airlinesCache = Array.isArray(list)
          ? list.filter((a) => a.iata && a.name)
          : [];
        return airlinesCache;
      })
      .catch(() => {
        airlinesCache = [];
        return airlinesCache;
      });

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
