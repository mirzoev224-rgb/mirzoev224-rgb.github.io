// api.js
// Обёртка над Travelpayouts Data API (эндпоинт prices_for_dates).
// Документация: https://travelpayouts.github.io/slate/#prices_for_dates

window.FlightAPI = (function () {
  const { API_BASE, TRAVELPAYOUTS_TOKEN, CURRENCY } = window.APP_CONFIG;

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
  async function fetchForDate({ origin, destination, departureDate, directOnly }) {
    const params = new URLSearchParams({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departure_at: departureDate,
      one_way: "true",
      direct: directOnly ? "true" : "false",
      currency: CURRENCY,
      sorting: "price",
      limit: "30",
      page: "1",
      token: TRAVELPAYOUTS_TOKEN,
    });

    const url = `${API_BASE}/aviasales/v3/prices_for_dates?${params.toString()}`;

    let response;
    try {
      response = await fetch(url);
    } catch (networkErr) {
      throw new ApiError(
        "network",
        "Нет соединения с сервером. Проверь интернет и попробуй снова."
      );
    }

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

    const data = await response.json();

    if (!data || data.success === false) {
      throw new ApiError("server", "Сервер не смог обработать запрос.");
    }

    return Array.isArray(data.data) ? data.data : [];
  }

  // Поиск с опциональным разбросом дат ±3 дня.
  // Делает несколько запросов (по одному на дату), т.к. API не умеет диапазоны дат.
  async function search({
    origin,
    destination,
    departureDate,
    flexibleDates,
    directOnly,
    airlineFilter,
    sortOrder,
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
        });
        results.push(...tickets);
      } catch (err) {
        errors.push(err);
      }
    }

    // Если вообще ни один запрос не удался - пробрасываем первую ошибку наверх.
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
