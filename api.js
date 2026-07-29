// api.js
// Обёртка над Travelpayouts Data API (эндпоинт prices_for_dates).
// Документация: https://travelpayouts.github.io/slate/#prices_for_dates

window.FlightAPI = (function () {
  const { API_BASE, TRAVELPAYOUTS_TOKEN } = window.APP_CONFIG;

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

    // Если Travelpayouts вообще не ответил ни разу - пробрасываем первую ошибку.
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
