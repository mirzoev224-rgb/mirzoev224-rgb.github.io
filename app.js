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

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
  }

  function renderResults(tickets, originLabel, destinationLabel) {
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
          <span class="route">${originLabel} → ${destinationLabel}</span>
          <span class="price">${ticket.price} ${window.APP_CONFIG.CURRENCY.toUpperCase()}</span>
        </div>
        <div class="ticket-meta">
          <span class="badge">${formatDate(ticket.departure_at)}</span>
          <span class="badge">${transferLabel}</span>
          ${ticket.airline ? `<span class="badge">${ticket.airline}</span>` : ""}
        </div>
      `;

      li.addEventListener("click", () => {
        const url = window.FlightAPI.buildBookingUrl(
          ticket,
          window.__lastSearch.originCode,
          window.__lastSearch.destinationCode
        );
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

  window.__lastSearch = { originCode: "", destinationCode: "" };

  async function runSearch(params) {
    window.__lastSearch = {
      originCode: params.origin,
      destinationCode: params.destination,
    };
    showScreen("loading");
    try {
      const tickets = await window.FlightAPI.search(params);
      renderResults(tickets, params.originLabel, params.destinationLabel);
      showScreen("results");
    } catch (err) {
      const message =
        err && err.message ? err.message : "Не удалось выполнить поиск.";
      showError(message, { retry: () => runSearch(params) });
    }
  }

  // ---------- Автокомплит (города и авиакомпании) ----------

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function setupCityAutocomplete(inputId, suggestionsId, flagId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(suggestionsId);
    const flagEl = flagId ? document.getElementById(flagId) : null;

    input.dataset.code = "";

    const runSearchDebounced = debounce(async (term) => {
      const results = await window.ReferenceData.searchCities(term);
      renderCitySuggestions(results);
    }, 300);

    function renderCitySuggestions(results) {
      list.innerHTML = "";
      if (!results.length) {
        list.classList.add("hidden");
        return;
      }
      results.forEach((item) => {
        const li = document.createElement("li");
        li.className = "suggestion-item";
        li.innerHTML = `<span class="suggestion-flag">${item.flag}</span> ${item.name}${
          item.countryName ? `, ${item.countryName}` : ""
        }`;
        li.addEventListener("click", () => {
          input.value = item.name;
          input.dataset.code = item.code;
          input.dataset.label = item.name;
          if (flagEl) flagEl.textContent = item.flag;
          list.classList.add("hidden");
        });
        list.appendChild(li);
      });
      list.classList.remove("hidden");
    }

    input.addEventListener("input", () => {
      input.dataset.code = "";
      if (flagEl) flagEl.textContent = "";
      const term = input.value;
      if (term.trim().length < 2) {
        list.classList.add("hidden");
        return;
      }
      runSearchDebounced(term);
    });

    input.addEventListener("blur", () => {
      // Небольшая задержка, чтобы клик по подсказке успел сработать до скрытия списка.
      setTimeout(() => list.classList.add("hidden"), 150);
    });
  }

  function setupAirlineAutocomplete(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(suggestionsId);

    input.dataset.code = "";

    const runSearchDebounced = debounce(async (term) => {
      const results = await window.ReferenceData.searchAirlines(term);
      renderAirlineSuggestions(results);
    }, 300);

    function renderAirlineSuggestions(results) {
      list.innerHTML = "";
      if (!results.length) {
        list.classList.add("hidden");
        return;
      }
      results.forEach((item) => {
        const li = document.createElement("li");
        li.className = "suggestion-item";
        li.textContent = item.name;
        li.addEventListener("click", () => {
          input.value = item.name;
          input.dataset.code = item.code;
          list.classList.add("hidden");
        });
        list.appendChild(li);
      });
      list.classList.remove("hidden");
    }

    input.addEventListener("input", () => {
      input.dataset.code = "";
      const term = input.value;
      if (term.trim().length < 2) {
        list.classList.add("hidden");
        return;
      }
      runSearchDebounced(term);
    });

    input.addEventListener("blur", () => {
      setTimeout(() => list.classList.add("hidden"), 150);
    });
  }

  setupCityAutocomplete("origin", "origin-suggestions", "origin-flag");
  setupCityAutocomplete("destination", "destination-suggestions", "destination-flag");
  setupAirlineAutocomplete("airline-filter", "airline-suggestions");

  // ---------- Форма поиска ----------

  function readFormValues() {
    const originInput = document.getElementById("origin");
    const destinationInput = document.getElementById("destination");
    const airlineInput = document.getElementById("airline-filter");

    const departureDate = document.getElementById("departure-date").value;
    const flexibleDates = document.getElementById("flexible-dates").checked;
    const directOnly = document.getElementById("direct-only").checked;
    const sortOrder = document.getElementById("sort-order").value;

    return {
      origin: originInput.dataset.code || "",
      originLabel: originInput.value.trim(),
      destination: destinationInput.dataset.code || "",
      destinationLabel: destinationInput.value.trim(),
      departureDate,
      flexibleDates,
      directOnly,
      airlineFilter: airlineInput.dataset.code || "",
      sortOrder,
    };
  }

  function validate(params) {
    if (!params.origin) {
      return "Выбери город вылета из списка подсказок.";
    }
    if (!params.destination) {
      return "Выбери город назначения из списка подсказок.";
    }
    if (params.origin === params.destination) {
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
    const originFlag = document.getElementById("origin-flag");
    const destinationFlag = document.getElementById("destination-flag");

    const tmpValue = origin.value;
    const tmpCode = origin.dataset.code;
    const tmpLabel = origin.dataset.label;
    const tmpFlag = originFlag.textContent;

    origin.value = destination.value;
    origin.dataset.code = destination.dataset.code;
    origin.dataset.label = destination.dataset.label;
    originFlag.textContent = destinationFlag.textContent;

    destination.value = tmpValue;
    destination.dataset.code = tmpCode;
    destination.dataset.label = tmpLabel;
    destinationFlag.textContent = tmpFlag;
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
