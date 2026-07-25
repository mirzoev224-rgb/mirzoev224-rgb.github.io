// app.js
(function () {
  // Если открыто внутри Telegram - разворачиваем на весь экран и подстраиваем тему.
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    if (tg.themeParams && tg.themeParams.bg_color) {
      document.body.style.background = tg.themeParams.bg_color;
    }
  }

  const screens = {
    search: document.getElementById("screen-search"),
    loading: document.getElementById("screen-loading"),
    error: document.getElementById("screen-error"),
    results: document.getElementById("screen-results"),
  };

  let lastSearchParams = null;

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
  }

  function renderResults(tickets, origin, destination) {
    const list = document.getElementById("results-list");
    const empty = document.getElementById("results-empty");
    const count = document.getElementById("results-count");

    list.innerHTML = "";

    if (!tickets.length) {
      empty.classList.remove("hidden");
      count.textContent = "";
      return;
    }

    empty.classList.add("hidden");
    count.textContent = `Найдено: ${tickets.length}`;

    tickets.forEach((ticket) => {
      const li = document.createElement("li");
      li.className = "ticket-card";

      const transferLabel =
        ticket.transfers === 0
          ? "Прямой"
          : `${ticket.transfers} пересадк${ticket.transfers === 1 ? "а" : "и"}`;

      li.innerHTML = `
        <div class="ticket-route">
          <span class="route">${origin.toUpperCase()} → ${destination.toUpperCase()}</span>
          <span class="price">${ticket.price} ${window.APP_CONFIG.CURRENCY.toUpperCase()}</span>
        </div>
        <div class="ticket-meta">
          <span class="badge">${formatDate(ticket.departure_at)}</span>
          <span class="badge">${transferLabel}</span>
          ${ticket.airline ? `<span class="badge">${ticket.airline}</span>` : ""}
        </div>
      `;

      li.addEventListener("click", () => {
        const url = window.FlightAPI.buildBookingUrl(ticket, origin, destination);
        window.open(url, "_blank");
      });

      list.appendChild(li);
    });
  }

  function showError(message, { retry } = {}) {
    document.getElementById("error-message").textContent = message;
    const actions = document.getElementById("error-actions");
    actions.innerHTML = "";

    if (retry) {
      const btn = document.createElement("button");
      btn.id = "retry-btn";
      btn.className = "primary-btn";
      btn.textContent = "Повторить";
      btn.addEventListener("click", retry);
      actions.appendChild(btn);
    }

    const backBtn = document.createElement("button");
    backBtn.className = "text-btn";
    backBtn.textContent = "← Новый поиск";
    backBtn.addEventListener("click", () => showScreen("search"));
    actions.appendChild(backBtn);

    showScreen("error");
  }

  async function runSearch(params) {
    lastSearchParams = params;
    showScreen("loading");
    try {
      const tickets = await window.FlightAPI.search(params);
      renderResults(tickets, params.origin, params.destination);
      showScreen("results");
    } catch (err) {
      const message =
        err && err.message ? err.message : "Не удалось выполнить поиск.";
      showError(message, { retry: () => runSearch(params) });
    }
  }

  function readFormValues() {
    const origin = document.getElementById("origin").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const departureDate = document.getElementById("departure-date").value;
    const flexibleDates = document.getElementById("flexible-dates").checked;
    const directOnly = document.getElementById("direct-only").checked;
    const airlineFilter = document.getElementById("airline-filter").value.trim();
    const sortOrder = document.getElementById("sort-order").value;

    return {
      origin,
      destination,
      departureDate,
      flexibleDates,
      directOnly,
      airlineFilter,
      sortOrder,
    };
  }

  function validate(params) {
    if (!/^[A-Za-z]{3}$/.test(params.origin)) {
      return "Код города «откуда» должен состоять из 3 латинских букв (например, MOW).";
    }
    if (!/^[A-Za-z]{3}$/.test(params.destination)) {
      return "Код города «куда» должен состоять из 3 латинских букв (например, BKK).";
    }
    if (params.origin.toUpperCase() === params.destination.toUpperCase()) {
      return "Пункт отправления и назначения не могут совпадать.";
    }
    if (!params.departureDate) {
      return "Выбери дату вылета.";
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(params.departureDate) < today) {
      return "Дата вылета не может быть в прошлом.";
    }
    return null;
  }

  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const params = readFormValues();
    const validationError = validate(params);
    if (validationError) {
      showError(validationError, { retry: null });
      return;
    }
    runSearch(params);
  });

  document.getElementById("swap-btn").addEventListener("click", () => {
    const origin = document.getElementById("origin");
    const destination = document.getElementById("destination");
    const tmp = origin.value;
    origin.value = destination.value;
    destination.value = tmp;
  });

  document.getElementById("back-btn").addEventListener("click", () => {
    showScreen("search");
  });

  // Дефолтная дата вылета - через неделю от сегодня.
  (function setDefaultDate() {
    const input = document.getElementById("departure-date");
    const d = new Date();
    d.setDate(d.getDate() + 7);
    input.value = d.toISOString().slice(0, 10);
    input.min = new Date().toISOString().slice(0, 10);
  })();

  showScreen("search");
})();
