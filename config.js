// config.js
// Настройки приложения. Заполни свой токен перед сборкой.

window.APP_CONFIG = {
  // Токен из личного кабинета Travelpayouts (travelpayouts.com -> API -> Data API token)
  TRAVELPAYOUTS_TOKEN: "4212833feef4c958938909ea81faebca",

  // Партнёрский marker из личного кабинета Travelpayouts (нужен для ссылок на покупку).
  // Если ещё не участвуешь в партнёрской программе - можно оставить как есть,
  // ссылки на покупку будут вести на общий поиск Aviasales без маркера.
  MARKER: "",

  // Валюта, в которой показывать цены
  CURRENCY: "rub",

  // Базовый URL Data API
  API_BASE: "https://api.travelpayouts.com",
};
