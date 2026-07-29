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

  // Список запасных путей, если прямой запрос заблокирован браузером (CORS) -
  // тот же набор, что уже проверен в api.js. Один бесплатный прокси может быть
  // временно недоступен, поэтому пробуем несколько по очереди.
  const CORS_PROXIES = [
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  // Пытается получить JSON напрямую; если браузер блокирует запрос (CORS) -
  // пробует по очереди несколько прокси. Логирует в консоль, чтобы при
  // отладке было видно, что именно произошло.
  async function fetchJsonWithCorsFallback(url, label) {
    const attempts = [
      () => fetch(url),
      ...CORS_PROXIES.map((buildProxyUrl) => () => fetch(buildProxyUrl(url))),
    ];

    for (const attempt of attempts) {
      try {
        const response = await attempt();
        if (!response.ok) continue;
        return await response.json();
      } catch (err) {
        console.warn(`[${label}] один из путей не сработал, пробую следующий`, err);
      }
    }

    console.error(`[${label}] все пути (прямой + все прокси) провалились`);
    return null;
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
        const parsed = Array.isArray(list) ? list.filter((a) => a.iata && a.name) : [];
        airlinesLoadingPromise = null;
        if (parsed.length > 0) {
          airlinesCache = parsed; // кэшируем только реальный успех
        }
        return parsed;
      }
    );

    return airlinesLoadingPromise;
  }

  // Логотип авиакомпании - официальный бесплатный сервис Aviasales/Travelpayouts,
  // не требует токена: https://pics.avs.io/{ширина}/{высота}/{IATA}.png
  function airlineLogoUrl(iataCode) {
    return `https://pics.avs.io/110/40/${iataCode}.png`;
  }

  // 5 самых известных авиакомпаний - показываются по умолчанию при фокусе на
  // поле, ещё до того как человек начал печатать.
  const POPULAR_AIRLINES = [
    { code: "TK", name: "Turkish Airlines" },
    { code: "EK", name: "Emirates" },
    { code: "QR", name: "Qatar Airways" },
    { code: "LH", name: "Lufthansa" },
    { code: "BA", name: "British Airways" },
  ];

  function getPopularAirlines() {
    return POPULAR_AIRLINES.map((a) => ({
      ...a,
      logo: airlineLogoUrl(a.code),
    }));
  }

  async function searchAirlines(term) {
    if (!term || term.trim().length < 2) return [];
    const list = await loadAirlines();
    const q = term.trim().toLowerCase();
    return list
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((a) => ({ code: a.iata, name: a.name, logo: airlineLogoUrl(a.iata) }));
  }

  return {
    searchCities,
    searchAirlines,
    countryCodeToFlag,
    loadAirlines,
    getPopularAirlines,
    airlineLogoUrl,
  };
})();
