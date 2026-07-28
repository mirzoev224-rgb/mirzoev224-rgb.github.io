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

  function openTicket(ticket) {
    const url = window.FlightAPI.buildBookingUrl(
      ticket,
      window.__lastSearch.originCode,
      window.__lastSearch.destinationCode
    );
    window.open(url, "_blank");
  }

  // Музыка на экране "билетов нема" - играет по кругу, пока экран виден.
  const emptyStateAudio = document.getElementById("empty-state-audio");

  function playEmptyStateAudio() {
    if (!emptyStateAudio) return;
    emptyStateAudio.currentTime = 0;
    emptyStateAudio.play().catch(() => {
      // Браузер может заблокировать автовоспроизведение - не критично,
      // просто тихо ничего не играем в этом случае.
    });
  }

  function stopEmptyStateAudio() {
    if (!emptyStateAudio) return;
    emptyStateAudio.pause();
    emptyStateAudio.currentTime = 0;
  }

  function renderResults(tickets, originLabel, destinationLabel) {
    const list = document.getElementById("results-list");
    const empty = document.getElementById("results-empty");
    const count = document.getElementById("results-count");

    list.innerHTML = "";

    if (!tickets.length) {
      empty.classList.remove("hidden");
      count.textContent = "";
      playEmptyStateAudio();
      return;
    }

    empty.classList.add("hidden");
    stopEmptyStateAudio();
    count.textContent = `Найдено: ${tickets.length}`;

    tickets.forEach((ticket) => {
      const li = document.createElement("li");
      li.className = "ticket-card";
      // Доступность с клавиатуры: карточка ведёт себя как кнопка.
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.setAttribute(
        "aria-label",
        `${originLabel} в ${destinationLabel}, ${ticket.price} ${currencySymbol()}, открыть для покупки`
      );

      const transferLabel =
        ticket.transfers === 0
          ? "Прямой"
          : ticket.transfers == null
          ? null
          : `${ticket.transfers} пересадк${ticket.transfers === 1 ? "а" : "и"}`;

      li.innerHTML = `
        <div class="ticket-route">
          <span class="route">${originLabel} → ${destinationLabel}</span>
          <span class="price">${ticket.price} ${currencySymbol()}</span>
        </div>
        <div class="ticket-meta">
          ${formatDate(ticket.departure_at) ? `<span class="badge">${formatDate(ticket.departure_at)}</span>` : ""}
          ${transferLabel ? `<span class="badge">${transferLabel}</span>` : ""}
          ${ticket.airline ? `<span class="badge">${ticket.airline}</span>` : ""}
          ${ticket.source ? `<span class="badge badge-source">${ticket.source}</span>` : ""}
        </div>
      `;

      li.addEventListener("click", () => openTicket(ticket));
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openTicket(ticket);
        }
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
  window.__lastSearchParams = null;

  // ---------- Выбор валюты ----------
  const CURRENCIES = { rub: "₽", usd: "$", eur: "€", uah: "₴" };

  function loadSavedCurrency() {
    try {
      const saved = window.localStorage.getItem("currency");
      if (saved && CURRENCIES[saved]) return saved;
    } catch (err) {
      // localStorage недоступен (приватный режим и т.п.) - используем значение по умолчанию
    }
    return (window.APP_CONFIG && window.APP_CONFIG.CURRENCY) || "rub";
  }

  let currentCurrency = loadSavedCurrency();

  const currencyBtn = document.getElementById("currency-btn");
  const currencyBtnLabel = document.getElementById("currency-btn-label");
  const currencyDropdown = document.getElementById("currency-dropdown");

  function currencySymbol() {
    return CURRENCIES[currentCurrency] || "";
  }

  function applyCurrencyToUI(code) {
    currentCurrency = code;
    currencyBtnLabel.textContent = `${currencySymbol()} ${code.toUpperCase()}`;
    currencyDropdown.querySelectorAll("li").forEach((li) => {
      li.setAttribute(
        "aria-selected",
        li.dataset.currency === code ? "true" : "false"
      );
    });
    try {
      window.localStorage.setItem("currency", code);
    } catch (err) {
      // Не критично, если сохранить не получилось
    }
  }

  function closeCurrencyDropdown() {
    currencyDropdown.classList.add("hidden");
    currencyBtn.setAttribute("aria-expanded", "false");
  }

  function openCurrencyDropdown() {
    // Т.к. дропдаун position:fixed (не зависит от родительских контекстов
    // наложения), ставим его координаты вручную по положению кнопки на экране.
    const rect = currencyBtn.getBoundingClientRect();
    currencyDropdown.style.top = `${rect.bottom + 4}px`;
    currencyDropdown.style.left = `${rect.left}px`;
    currencyDropdown.classList.remove("hidden");
    currencyBtn.setAttribute("aria-expanded", "true");
  }

  currencyBtn.addEventListener("click", () => {
    const isOpen = !currencyDropdown.classList.contains("hidden");
    if (isOpen) {
      closeCurrencyDropdown();
    } else {
      openCurrencyDropdown();
    }
  });

  function chooseCurrency(li) {
    const code = li.dataset.currency;
    applyCurrencyToUI(code);
    closeCurrencyDropdown();
    // Если результаты уже на экране - обновляем их сразу в новой валюте.
    if (window.__lastSearchParams) {
      runSearch({ ...window.__lastSearchParams, currency: code });
    }
  }

  currencyDropdown.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => chooseCurrency(li));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        chooseCurrency(li);
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".currency-selector")) {
      closeCurrencyDropdown();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      closeCurrencyDropdown();
    },
    { passive: true }
  );

  applyCurrencyToUI(currentCurrency);

  async function runSearch(params) {
    window.__lastSearchParams = params;
    window.__lastSearch = {
      originCode: params.origin,
      destinationCode: params.destination,
    };
    stopEmptyStateAudio();
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
  // Реализован как упрощённый ARIA combobox: role="combobox" на input +
  // role="listbox"/role="option" на подсказках, доступно с клавиатуры
  // (стрелки, Enter, Escape), не только мышью/тапом.

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function setupAutocomplete({
    inputId,
    suggestionsId,
    flagId,
    fetchFn,
    renderLabel,
    onSelect,
    defaultResultsFn,
  }) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(suggestionsId);
    const flagEl = flagId ? document.getElementById(flagId) : null;

    input.dataset.code = "";
    let activeIndex = -1;
    let currentResults = [];

    function closeList() {
      list.classList.add("hidden");
      list.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      activeIndex = -1;
      currentResults = [];
    }

    function selectItem(item) {
      onSelect(item, input, flagEl);
      closeList();
    }

    function renderSuggestions(results) {
      currentResults = results;
      activeIndex = -1;
      list.innerHTML = "";

      if (!results.length) {
        closeList();
        return;
      }

      results.forEach((item, index) => {
        const li = document.createElement("li");
        li.className = "suggestion-item";
        li.id = `${suggestionsId}-option-${index}`;
        li.setAttribute("role", "option");
        li.setAttribute("tabindex", "-1");
        li.innerHTML = renderLabel(item);

        li.addEventListener("mousedown", (e) => {
          // mousedown, а не click - чтобы сработать раньше blur у инпута.
          e.preventDefault();
          selectItem(item);
        });

        list.appendChild(li);
      });

      list.classList.remove("hidden");
      input.setAttribute("aria-expanded", "true");
    }

    function setActive(index) {
      const items = list.querySelectorAll(".suggestion-item");
      items.forEach((el) => el.classList.remove("suggestion-item-active"));
      if (index >= 0 && index < items.length) {
        items[index].classList.add("suggestion-item-active");
        items[index].scrollIntoView({ block: "nearest" });
        input.setAttribute("aria-activedescendant", items[index].id);
        activeIndex = index;
      } else {
        input.removeAttribute("aria-activedescendant");
        activeIndex = -1;
      }
    }

    const runSearchDebounced = debounce(async (term) => {
      const results = await fetchFn(term);
      renderSuggestions(results);
    }, 300);

    input.addEventListener("input", () => {
      input.dataset.code = "";
      if (flagEl) flagEl.textContent = "";
      const term = input.value;
      if (term.trim().length < 2) {
        closeList();
        return;
      }
      runSearchDebounced(term);
    });

    input.addEventListener("keydown", (e) => {
      if (list.classList.contains("hidden")) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, currentResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && currentResults[activeIndex]) {
          e.preventDefault();
          selectItem(currentResults[activeIndex]);
        }
      } else if (e.key === "Escape") {
        closeList();
      }
    });

    input.addEventListener("focus", () => {
      if (input.value.trim().length > 0) return; // уже что-то напечатано - не мешаем
      if (!defaultResultsFn) return;
      const results = defaultResultsFn();
      renderSuggestions(results);
    });

    input.addEventListener("blur", () => {
      // Небольшая задержка не нужна: выбор идёт через mousedown (срабатывает раньше blur).
      closeList();
    });
  }

  setupAutocomplete({
    inputId: "origin",
    suggestionsId: "origin-suggestions",
    flagId: "origin-flag",
    fetchFn: (term) => window.ReferenceData.searchCities(term),
    renderLabel: (item) =>
      `<span class="suggestion-flag">${item.flag}</span> ${item.name}${
        item.countryName ? `, ${item.countryName}` : ""
      }`,
    onSelect: (item, input, flagEl) => {
      input.value = item.name;
      input.dataset.code = item.code;
      input.dataset.label = item.name;
      if (flagEl) flagEl.textContent = item.flag;
    },
  });

  setupAutocomplete({
    inputId: "destination",
    suggestionsId: "destination-suggestions",
    flagId: "destination-flag",
    fetchFn: (term) => window.ReferenceData.searchCities(term),
    renderLabel: (item) =>
      `<span class="suggestion-flag">${item.flag}</span> ${item.name}${
        item.countryName ? `, ${item.countryName}` : ""
      }`,
    onSelect: (item, input, flagEl) => {
      input.value = item.name;
      input.dataset.code = item.code;
      input.dataset.label = item.name;
      if (flagEl) flagEl.textContent = item.flag;
    },
  });

  setupAutocomplete({
    inputId: "airline-filter",
    suggestionsId: "airline-suggestions",
    flagId: null,
    fetchFn: (term) => window.ReferenceData.searchAirlines(term),
    defaultResultsFn: () => window.ReferenceData.getPopularAirlines(),
    renderLabel: (item) =>
      `<img src="${item.logo}" alt="" class="suggestion-airline-logo" loading="lazy" onerror="this.style.visibility='hidden'" /> ${item.name}`,
    onSelect: (item, input) => {
      input.value = item.name;
      input.dataset.code = item.code;
    },
  });

  // ---------- Форма поиска ----------

  function readFormValues() {
    const originInput = document.getElementById("origin");
    const destinationInput = document.getElementById("destination");
    const airlineInput = document.getElementById("airline-filter");

    const departureDate = document.getElementById("departure-date").value;
    const flexibleDates = document.getElementById("flexible-dates").checked;
    const directOnly = document.getElementById("direct-only").checked;
    const sortOrder = document.getElementById("sort-order").value;
    const adults = Number(document.getElementById("passengers").value) || 1;
    const cabin = document.getElementById("cabin-class").value;
    const tripType = document.getElementById("trip-type").value;
    const returnDate = document.getElementById("return-date").value;

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
      currency: currentCurrency,
      adults,
      cabin,
      tripType,
      returnDate,
    };
  }

  document.getElementById("trip-type").addEventListener("change", (e) => {
    const returnDateField = document.getElementById("return-date-field");
    if (e.target.value === "2") {
      returnDateField.classList.remove("hidden");
      document.getElementById("return-date").required = true;
    } else {
      returnDateField.classList.add("hidden");
      document.getElementById("return-date").required = false;
    }
  });

  function validate(params) {
    if (!params.origin) {
      return "Выбери город вылета из списка подсказок.";
    }
    if (!params.destination) {
      return "Выбери город назначения из списка подсказок.";
    }
    if (params.tripType === "2" && !params.returnDate) {
      return "Укажи дату обратно (выбран тип рейса «Туда-обратно»).";
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
    stopEmptyStateAudio();
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
