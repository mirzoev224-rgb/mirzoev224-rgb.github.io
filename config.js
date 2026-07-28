// config.js
// Настройки приложения. Заполни свой токен перед сборкой.

window.APP_CONFIG = {
  // Токен из личного кабинета Travelpayouts (travelpayouts.com -> API -> Data API token)
  TRAVELPAYOUTS_TOKEN: "4212833feef4c958938909ea81faebca",

  // Партнёрский marker из личного кабинета Travelpayouts (нужен для ссылок на покупку).
  // Если ещё не участвуешь в партнёрской программе - можно оставить как есть,
  // ссылки на покупку будут вести на общий поиск Aviasales без маркера.
  MARKER: "",

  // Валюта по умолчанию при первом открытии (дальше пользователь может
  // переключить её в приложении - выбор запоминается в браузере)
  CURRENCY: "uah",

  // Базовый URL Data API
  API_BASE: "https://api.travelpayouts.com",

  // Ключ RapidAPI для compare-flight-prices.p.rapidapi.com (второй источник
  // цен, сравнивает Kayak/Priceline/Expedia и другие агентства)
  RAPIDAPI_KEY: "62eaef6b02msh92c9df16aa94393p1a47c8jsn065f6d211dad",
};
