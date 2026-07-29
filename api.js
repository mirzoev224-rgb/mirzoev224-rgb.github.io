// api.js
// Обёртка над Travelpayouts Data API (эндпоинт prices_for_dates).
// Документация: https://travelpayouts.github.io/slate/#prices_for_dates

window.FlightAPI = (function () {
  const { API_BASE, TRAVELPAYOUTS_TOKEN, RAPIDAPI_KEY } = window.APP_CONFIG;
  const RAPIDAPI_HOST = "compare-flight-prices.p.rapidapi.com";

  function toISODate(date) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  // ---------- Конвертация валют (для compare-flight-prices, он отдаёт только $) ----------
  // yasen.aviasales.com/adaptors/currency.json отдаёт курсы к рублю, например
  // {"usd": 51.13, "eur": 57.15, "uah": 1.9, ...}. Кэшируем на сессию.
  let currencyRatesPromise = null;

  async function loadCurrencyRates() {
    if (currencyRatesPromise) return currencyRatesPromise;
    currencyRatesPromise = fetchJsonWithCorsFallback(
      "https://yasen.aviasales.com/adaptors/currency.json"
    ).catch((err) => {
      console.error("Не удалось загрузить курсы валют:", err);
      return null;
    });
    return currencyRatesPromise;
  }

  // Конвертирует сумму в долларах в целевую валюту (rub/usd/eur/uah).
  // Если курсы недоступны - возвращает исходную сумму как есть (в $) и это
  // будет видно по некорректно большой/маленькой цене - лучше, чем упасть.
  async function convertUsdTo(amountUsd, targetCurrency) {
    if (targetCurrency === "usd") return amountUsd;
    const rates = await loadCurrencyRates();
    if (!rates || !rates.usd) return amountUsd;
    const amountRub = amountUsd * rates.usd;
    if (targetCurrency === "rub") return amountRub;
    const targetRate = rates[targetCurrency];
    if (!targetRate) return amountUsd;
    return amountRub / targetRate;
  }

  // Один запрос к prices_for_dates на конкретную дату вылета.
  // Travelpayouts Data API не всегда отдаёт CORS-заголовки для прямых браузерных
  // запросов - если прямой fetch падает с сетевой ошибкой (что часто на самом деле
  // означает блокировку CORS, а не реальное отсутствие интернета), пробуем через
  // несколько запасных CORS-прокси по очереди (один прокси может быть временно
  // недоступен или перегружен - у бесплатных прокси нет гарантии аптайма).
  async function fetchForDate({ origin, destination, departureDate, directOnly, currency }) {
    const params = new URLSearchParams({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departure_at: departureDate,
      one_way: "true",
      direct: directOnly ? "true" : "false",
      currency: currency,
      sorting: "price",
      limit: "30",
      page: "1",
      token: TRAVELPAYOUTS_TOKEN,
    });

    const url = `${API_BASE}/aviasales/v3/prices_for_dates?${params.toString()}`;

    const data = await fetchJsonWithCorsFallback(url);

    if (!data || data.success === false) {
      throw new ApiError("server", "Сервер не смог обработать запрос.");
    }

    const tickets = Array.isArray(data.data) ? data.data : [];
    return tickets.map((t) => ({ ...t, source: "Aviasales" }));
  }

  // Список запасных путей, если прямой запрос заблокирован браузером (CORS).
  // Пробуем по очереди - если один прокси недоступен, идём к следующему.
  // corsproxy.io отдельно поддерживает *.github.io в бесплатном тарифе, поэтому
  // он первый в списке - должен штатно работать именно с нашим сайтом.
  const CORS_PROXIES = [
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  // Пытается получить JSON напрямую; если браузер блокирует запрос (CORS), сервер
  // отвечает ошибкой (включая таймауты вроде 408) или реально нет сети - пробует
  // по очереди несколько прокси. Останавливается сразу только на ошибке
  // авторизации (401/403) - там повтор через другой путь всё равно не поможет,
  // проблема в самом токене. Любая другая ошибка (таймаут, 5xx, обрыв сети) не
  // прерывает цепочку - идём к следующему варианту.
  async function fetchJsonWithCorsFallback(url) {
    const attempts = [
      () => fetch(url),
      ...CORS_PROXIES.map((buildProxyUrl) => () => fetch(buildProxyUrl(url))),
    ];

    let lastError = null;

    for (const attempt of attempts) {
      try {
        const response = await attempt();
        return await handleResponse(response);
      } catch (err) {
        if (err instanceof ApiError && err.type === "auth") {
          throw err; // неверный токен - другие пути не спасут, сообщаем сразу
        }
        lastError = err;
        console.error("Попытка не удалась, пробуем следующий путь:", err);
      }
    }

    // Все пути (прямой + все прокси) по очереди провалились.
    console.error("Все пути (прямой + все прокси) провалились.", lastError);
    throw new ApiError(
      "network",
      "Не удалось связаться с сервером цен ни напрямую, ни через резервные пути" +
        (lastError && lastError.message ? ` (последняя ошибка: ${lastError.message})` : "") +
        ". Проверь интернет и попробуй снова через минуту - бесплатные прокси-сервисы иногда временно перегружены."
    );
  }

  async function handleResponse(response) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        "auth",
        "Токен API недействителен или не подтверждён. Проверь config.js."
      );
    }

    if (!response.ok) {
      throw new ApiError(
        "server",
        `Сервер вернул ошибку (${response.status}). Попробуй позже.`
      );
    }

    try {
      return await response.json();
    } catch (err) {
      throw new ApiError("server", "Сервер прислал непонятный ответ.");
    }
  }

  // ---------- compare-flight-prices (RapidAPI) - второй источник цен ----------
  // Сравнивает Kayak/Priceline/Expedia и другие агентства. Работает в два шага:
  // StartFlightSearch запускает поиск и отдаёт ID, дальше GetPrices опрашивается
  // по этому ID, пока не придут цены. ВАЖНО: точное имя параметра для передачи
  // ID в GetPrices не подтверждено официальной документацией (в примере кода
  // от RapidAPI он не показан) - используется вариант "searchid" по аналогии с
  // остальными параметрами API. Если он окажется неверным, эта функция просто
  // вернёт пустой список, и приложение покажет только результаты Travelpayouts -
  // без падения всего поиска.
  const COMPARE_API_BASE = `https://${RAPIDAPI_HOST}/GetPricesAPI`;

  function rapidApiHeaders() {
    return {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    };
  }

  async function startCompareFlightSearch({
    origin,
    destination,
    departureDate,
    returnDate,
    tripType,
    cabin,
    adults,
  }) {
    const params = new URLSearchParams({
      city1: origin.toUpperCase(),
      city2: destination.toUpperCase(),
      date1: departureDate,
      date2: returnDate || departureDate,
      flightType: String(tripType),
      cabin: String(cabin),
      adults: String(adults),
      seniors: "0",
      youth: "0",
      child: "0",
      infant: "0",
      lapinfant: "0",
      islive: "false",
    });

    const url = `${COMPARE_API_BASE}/StartFlightSearch.aspx?${params.toString()}`;
    const response = await fetch(url, { headers: rapidApiHeaders() });

    if (!response.ok) {
      throw new Error(`StartFlightSearch вернул ${response.status}`);
    }

    // Ответ может быть JSON-объектом с полем ID, либо просто текстом с самим ID -
    // пробуем оба варианта, т.к. точный формат не подтверждён документацией.
    const rawText = await response.text();
    try {
      const json = JSON.parse(rawText);
      const id =
        json.SearchID || json.searchId || json.search_id || json.id || null;
      if (id) return String(id);
    } catch (err) {
      // не JSON - используем текст как есть
    }
    const trimmed = rawText.trim();
    if (!trimmed) throw new Error("StartFlightSearch не вернул ID поиска");
    return trimmed;
  }

  async function pollCompareFlightPrices(searchId) {
    const url = `${COMPARE_API_BASE}/GetPrices.aspx?searchid=${encodeURIComponent(
      searchId
    )}`;

    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Лимит бесплатного тарифа - 1 запрос в секунду.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      let response;
      try {
        response = await fetch(url, { headers: rapidApiHeaders() });
      } catch (err) {
        continue; // сетевой сбой на конкретной попытке - пробуем ещё раз
      }

      if (!response.ok) continue;

      const raw = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        continue; // ответ ещё не готов / не JSON - пробуем ещё раз
      }

      const list = normalizeCompareFlightPricesPayload(parsed);
      if (list.length > 0) return list;
    }

    return []; // не дождались результата за отведённое время
  }

  // Разбирает ответ GetPrices в общий формат билета. Схема ответа тоже не
  // подтверждена документацией - перебираются несколько правдоподобных
  // вариантов названий полей.
  function normalizeCompareFlightPricesPayload(parsed) {
    let items = null;
    if (Array.isArray(parsed)) items = parsed;
    else if (Array.isArray(parsed.results)) items = parsed.results;
    else if (Array.isArray(parsed.data)) items = parsed.data;
    else if (Array.isArray(parsed.prices)) items = parsed.prices;
    else if (Array.isArray(parsed.flights)) items = parsed.flights;

    if (!items) return [];

    const tickets = [];
    for (const item of items) {
      const rawPrice =
        item.price ??
        item.Price ??
        item.fare ??
        item.Fare ??
        item.totalPrice ??
        item.TotalPrice ??
        item.amount ??
        item.Amount;
      const price = Number(rawPrice);
      if (!price || Number.isNaN(price)) continue; // без цены билет бесполезен

      tickets.push({
        price,
        airline: item.airline || item.Airline || item.carrier || item.Carrier || "",
        departure_at:
          item.departure_at ||
          item.DepartureDate ||
          item.departureDate ||
          item.date ||
          null,
        transfers:
          typeof item.transfers === "number"
            ? item.transfers
            : typeof item.stops === "number"
            ? item.stops
            : null,
        source:
          item.agency ||
          item.Agency ||
          item.site ||
          item.Site ||
          item.provider ||
          item.Provider ||
          item.vendor ||
          item.Vendor ||
          "Сравнение цен",
        bookingUrl:
          item.url || item.Url || item.link || item.Link || item.bookingUrl || null,
        _currency: "usd", // compare-flight-prices отдаёт цены в долларах
      });
    }
    return tickets;
  }

  // Полный цикл: запустить поиск, дождаться цен, сконвертировать валюту.
  // Любая ошибка на любом шаге тихо гасится - этот источник опциональный.
  async function searchCompareFlightPrices(params, targetCurrency) {
    try {
      const searchId = await startCompareFlightSearch(params);
      const tickets = await pollCompareFlightPrices(searchId);
      const converted = [];
      for (const t of tickets) {
        const convertedPrice = await convertUsdTo(t.price, targetCurrency);
        converted.push({ ...t, price: Math.round(convertedPrice) });
      }
      return converted;
    } catch (err) {
      console.error(
        "compare-flight-prices недоступен, показываем только Travelpayouts:",
        err
      );
      return [];
    }
  }


  // Поиск с опциональным разбросом дат ±3 дня (только для Travelpayouts).
  // Делает несколько запросов (по одному на дату), т.к. API не умеет диапазоны дат.
  async function search({
    origin,
    destination,
    departureDate,
    flexibleDates,
    directOnly,
    airlineFilter,
    sortOrder,
    currency,
    adults,
    cabin,
    tripType,
    returnDate,
  }) {
    const baseDate = new Date(departureDate);
    const dateOffsets = flexibleDates ? [-3, -2, -1, 0, 1, 2, 3] : [0];

    const datesToQuery = dateOffsets.map((offset) =>
      toISODate(addDays(baseDate, offset))
    );

    const results = [];
    const errors = [];

    // Запросы идут последовательно, чтобы не превышать лимиты API.
    for (const date of datesToQuery) {
      try {
        const tickets = await fetchForDate({
          origin,
          destination,
          departureDate: date,
          directOnly,
          currency,
        });
        results.push(...tickets);
      } catch (err) {
        errors.push(err);
      }
    }

    // Если Travelpayouts вообще не ответил ни разу - и compare-flight-prices тоже
    // ничего не найдёт (шанс невелик, но не нулевой), тогда пробрасываем ошибку.
    // Второй источник ищем параллельно, только для точной даты (без ±3 дня -
    // при лимите 1 запрос/сек это было бы слишком долго и рискованно).
    const compareResults = await searchCompareFlightPrices(
      {
        origin,
        destination,
        departureDate: toISODate(baseDate),
        returnDate,
        tripType,
        cabin,
        adults,
      },
      currency
    );

    results.push(...compareResults);

    if (results.length === 0 && errors.length === datesToQuery.length) {
      throw errors[0];
    }

    let filtered = results;

    if (airlineFilter) {
      const code = airlineFilter.trim().toUpperCase();
      filtered = filtered.filter(
        (t) => (t.airline || "").toUpperCase() === code
      );
    }

    if (sortOrder === "date") {
      filtered.sort(
        (a, b) => new Date(a.departure_at) - new Date(b.departure_at)
      );
    } else {
      filtered.sort((a, b) => a.price - b.price);
    }

    return filtered;
  }

  // Ссылка на переход к покупке (партнёрский поиск Aviasales/Jetradar).
  function buildBookingUrl(ticket, origin, destination) {
    if (ticket.bookingUrl) return ticket.bookingUrl;

    const marker = window.APP_CONFIG.MARKER;
    const base = "https://www.aviasales.com/search";
    const params = new URLSearchParams({
      origin_iata: origin.toUpperCase(),
      destination_iata: destination.toUpperCase(),
      depart_date: ticket.departure_at ? ticket.departure_at.slice(0, 10) : "",
    });
    if (marker) params.set("marker", marker);
    return `${base}?${params.toString()}`;
  }

  function ApiError(type, message) {
    this.type = type;
    this.message = message;
  }
  ApiError.prototype = Object.create(Error.prototype);

  return { search, buildBookingUrl, ApiError };
})();
