import type { Messages } from './types.ts';

export const tr: Messages = {
  lang: 'tr',
  locale: 'tr',
  decimalSeparator: ',',
  percent: value => `%${value}`,

  weekdays: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  months: [
    'Oca',
    'Şub',
    'Mar',
    'Nis',
    'May',
    'Haz',
    'Tem',
    'Ağu',
    'Eyl',
    'Eki',
    'Kas',
    'Ara',
  ],
  today: 'Bugün',
  tomorrow: 'Yarın',

  conditions: {
    0: 'Açık',
    1: 'Az bulutlu',
    2: 'Parçalı bulutlu',
    3: 'Kapalı',
    45: 'Sis',
    48: 'Kırağılı sis',
    51: 'Hafif çisenti',
    53: 'Çisenti',
    55: 'Yoğun çisenti',
    56: 'Hafif donan çisenti',
    57: 'Donan çisenti',
    61: 'Hafif yağmur',
    63: 'Yağmur',
    65: 'Şiddetli yağmur',
    66: 'Hafif donan yağmur',
    67: 'Donan yağmur',
    71: 'Hafif kar',
    73: 'Kar',
    75: 'Yoğun kar',
    77: 'Kar taneleri',
    80: 'Hafif sağanak',
    81: 'Sağanak',
    82: 'Şiddetli sağanak',
    85: 'Hafif kar sağanağı',
    86: 'Kar sağanağı',
    95: 'Gök gürültülü sağanak',
    96: 'Gök gürültülü, dolu',
    99: 'Gök gürültülü, yoğun dolu',
  },
  unknownCondition: 'Bilinmiyor',
  compass: ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'],
  uv: {
    low: 'düşük',
    moderate: 'orta',
    high: 'yüksek',
    veryHigh: 'çok yüksek',
    extreme: 'aşırı',
  },
  units: {
    kmh: 'km/sa',
    mph: 'mil/sa',
    mm: 'mm',
    in: 'inç',
    hPa: 'hPa',
    inHg: 'inHg',
  },

  weather: {
    feelsLike: value => `hissedilen ${value}`,
    humidity: 'Nem',
    wind: 'Rüzgâr',
    gusts: value => `hamle ${value}`,
    uv: 'UV',
    sunrise: 'Gün doğumu',
    sunset: 'Gün batımı',
    polarNight: 'Kutup gecesi',
    midnightSun: 'Gece yarısı güneşi',
    pressure: 'Basınç',
    clouds: 'Bulut',
    todayRange: (low, high) => `Bugün ${low} ile ${high} arası`,
    chanceOfRain: value => `yağış ${value}`,
  },

  forecast: {
    title: days => (days === 1 ? 'Bugün' : `${days} günlük tahmin`),
    day: 'Gün',
    condition: 'Durum',
    low: 'Min',
    high: 'Maks',
    range: 'Aralık',
    rain: 'Yağış',
    precipitation: 'Miktar',
    wind: 'Rüzgâr',
  },

  hourly: {
    title: hours => `Önümüzdeki ${hours} saat`,
    time: 'Saat',
    temperature: 'Sıcaklık',
    rain: 'Yağış',
    condition: 'Durum',
    wind: 'Rüzgâr',
    rainPeak: value => `en fazla ${value}`,
    dry: 'yağışsız',
  },

  compare: {
    title: count => `${count} yer`,
    place: 'Yer',
    now: 'Şimdi',
    feelsLike: 'Hissedilen',
    condition: 'Durum',
    wind: 'Rüzgâr',
    humidity: 'Nem',
    today: 'Bugün',
  },

  cli: {
    description:
      'Terminalde hava durumu: ASCII çizimler, renk kodlu tahminler ve şehirleri yan yana karşılaştırma.',
    headings: {
      'Usage:': 'Kullanım:',
      'Arguments:': 'Argümanlar:',
      'Options:': 'Seçenekler:',
      'Global Options:': 'Genel seçenekler:',
      'Commands:': 'Komutlar:',
    },
    examples: 'Örnekler:',
    helpChoices: choices => `şunlardan biri: ${choices}`,
    helpDefault: value => `varsayılan: ${value}`,
    options: {
      help: 'yardımı göster',
      helpCommand: 'bir komutun yardımını göster',
      version: 'sürümü göster',
      units: 'birim sistemi',
      lang: 'dil',
      json: 'betikler için JSON çıktısı',
      noColor: 'renksiz düz metin',
      compact: 'kısa çıktı',
      verbose: 'yapılanları stderr’e yaz',
      ascii: 'yalnızca ASCII, Unicode sembolleri yok',
      noCache: 'veriyi her seferinde yeniden çek',
      lat: 'şehir yerine enlem',
      lon: 'şehir yerine boylam',
      country: 'yalnızca bu ülkedeki yerler (ISO kodu, ör. TR)',
      days: 'gün sayısı, 1–16',
      hours: 'saat sayısı, 1–168',
    },
    arguments: {
      city: 'yer adı; kesin olmak için ülkeyi ekleyin: "Paris, Fransa"',
      cities: 'iki ya da daha fazla yer; boşluk içerenleri tırnak içine alın',
      shell: 'bash, zsh ya da fish',
      key: 'city, units ya da lang',
      value: 'yeni değer',
      favorite: '"fav list" çıktısındaki ad ya da numara',
    },
    commands: {
      now: 'şu anki hava durumu',
      forecast: 'günlük tahmin',
      hourly: 'grafikli saatlik tahmin',
      compare: 'yerleri yan yana karşılaştır',
      config: 'ayarları göster ya da değiştir',
      configList: 'tüm ayarları göster',
      configGet: 'bir ayarı göster',
      configSet: 'bir ayarı değiştir',
      configUnset: 'bir ayarı varsayılana döndür',
      configReset: 'tüm ayarları varsayılana döndür',
      configPath: 'ayarların nerede saklandığını göster',
      fav: 'favori yerleri yönet',
      favAdd: 'favori ekle',
      favRemove: 'favori sil',
      favList: 'favorileri listele',
      completion: 'kabuk tamamlama betiğini yazdır',
      cache: 'önbelleği yönet',
      cacheClear: 'önbelleği temizle',
    },

    fetching: 'Hava durumu alınıyor…',
    choosePlace: query => `Hangi “${query}”?`,
    bestGuess: (place, query) =>
      `${place} gösteriliyor. “${query}” adında başka yerler de var: ülkeyi ekleyin (“${query}, US”) ya da --country kullanın.`,
    staleData: (time, age) =>
      `Çevrimdışı: ${time} verisi gösteriliyor (${age}).`,
    minutesAgo: minutes => `${minutes} dakika önce`,
    hoursAgo: hours => `${hours} saat önce`,
    noCity:
      'Hangi yer? “skycast now İstanbul” deneyin ya da varsayılan bir yer seçin: “skycast config set city İstanbul”.',
    latLonPair: '--lat ve --lon birlikte kullanılır.',
    cityOrCoordinates:
      'Ya bir yer adı ya da --lat/--lon verin, ikisini birden değil.',
    invalidLatitude: value => `“${value}” -90 ile 90 arasında bir enlem değil.`,
    invalidLongitude: value =>
      `“${value}” -180 ile 180 arasında bir boylam değil.`,
    invalidInteger: (value, min, max) =>
      `“${value}” ${min} ile ${max} arasında bir tam sayı değil.`,
    invalidCountry: value =>
      `“${value}” iki harfli bir ülke kodu değil (TR, DE, US…).`,
    compareNeedsTwo: 'Karşılaştırma için en az iki yer gerekir.',
    compareTooMany: max =>
      `Tek seferde en fazla ${max} yer karşılaştırılabilir.`,
    compareFailed: (query, reason) => `${query}: ${reason}`,
    didYouMean: command => `“skycast ${command}” mı demek istediniz?`,

    errors: {
      notFound: query =>
        `“${query}” adında bir yer bulunamadı. Yazımı kontrol edin ya da ülkeyi ekleyin: “${query}, TR”.`,
      network: host =>
        `${host} adresine ulaşılamadı. Bağlantınızı kontrol edin; son sonuçlar çevrimdışı kullanım için saklanır.`,
      timeout: host =>
        `${host} zamanında yanıt vermedi. Biraz sonra yeniden deneyin.`,
      upstream: (status, reason) =>
        `Hava durumu servisi bir hata döndürdü (${status}): ${reason}`,
      rateLimited:
        'Hava durumu servisine çok fazla istek gönderildi. Bir dakika bekleyip yeniden deneyin.',
      invalidResponse:
        'Hava durumu servisi skycast’in anlamadığı bir yanıt gönderdi. Daha sonra yeniden deneyin.',
      config: (path, detail) =>
        `${path} ayar dosyası geçerli değil (${detail}). Dosyayı düzeltin ya da “skycast config reset” ile sıfırlayın.`,
      internal: message => `Bir şeyler ters gitti: ${message}`,
      verboseHint:
        'Ayrıntılar için --verbose ile yeniden çalıştırın ve lütfen bildirin: https://github.com/mylcin/weather-cli/issues',
      unknownOption: option => `bilinmeyen seçenek: ${option}`,
      unknownCommand: command => `bilinmeyen komut: “${command}”`,
      missingArgument: name => `${name} eksik`,
      optionMissingValue: option => `${option} için bir değer gerekli`,
      tooManyArguments: 'fazla argüman',
      invalidChoice: (value, choices) =>
        `“${value}” geçerli değil, şunlardan biri olmalı: ${choices}`,
      suggestion: options => `${options} mı demek istediniz?`,
    },

    config: {
      keys: { city: 'city', units: 'units', lang: 'lang' },
      notSet: 'ayarlanmadı',
      automatic: value => `${value} (otomatik)`,
      saved: (key, value) => `${key} artık ${value}.`,
      cleared: key => `${key} varsayılana döndü.`,
      reset: 'Tüm ayarlar varsayılana döndü.',
      unknownKey: (key, keys) =>
        `“${key}” adında bir ayar yok. Ayarlar: ${keys}.`,
      invalidValue: (key, value, allowed) =>
        `“${value}”, ${key} için geçerli değil. Şunlardan birini kullanın: ${allowed}.`,
    },

    favorites: {
      added: place => `${place} favorilere eklendi.`,
      alreadyAdded: place => `${place} zaten favorilerde.`,
      removed: place => `${place} favorilerden çıkarıldı.`,
      notFound: ref =>
        `“${ref}” ile eşleşen bir favori yok. “skycast fav list” ile bakın.`,
      empty:
        'Henüz favori yok. “skycast fav add İstanbul” ile ekleyebilirsiniz.',
    },

    home: {
      empty:
        '“skycast config set city İstanbul” ile varsayılan bir yer seçin ya da “skycast fav add Paris” ile favori ekleyin; sonra yalnızca “skycast” yazmanız yeterli.',
    },

    cacheCleared: count => `Önbellekten ${count} yanıt silindi.`,
  },

  coordinates: (latitude, longitude) => `${latitude}, ${longitude}`,
  north: 'K',
  south: 'G',
  east: 'D',
  west: 'B',
};
