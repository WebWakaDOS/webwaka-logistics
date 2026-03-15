/**
 * Internationalisation (i18n) [Part 9.1 — Africa First]
 * Supported languages: English (en), Yoruba (yo), Igbo (ig), Hausa (ha)
 * Nigeria First: English is the default, with full support for the three major Nigerian languages.
 */

export type Locale = "en" | "yo" | "ig" | "ha";

export const LOCALES: Record<Locale, string> = {
  en: "English",
  yo: "Yoruba",
  ig: "Igbo",
  ha: "Hausa",
};

export type TranslationKeys = {
  // Navigation
  dashboard: string;
  parcels: string;
  newParcel: string;
  tracking: string;
  dispatchNav: string;
  reports: string;
  settings: string;
  // Parcel fields
  trackingNumber: string;
  status: string;
  sender: string;
  recipient: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  description: string;
  weight: string;
  deliveryFee: string;
  priority: string;
  currency: string;
  // Status labels
  PENDING: string;
  COLLECTED: string;
  IN_TRANSIT: string;
  OUT_FOR_DELIVERY: string;
  DELIVERED: string;
  FAILED: string;
  RETURNED: string;
  // Priority labels
  STANDARD: string;
  EXPRESS: string;
  SAME_DAY: string;
  // Actions
  create: string;
  save: string;
  cancel: string;
  search: string;
  track: string;
  dispatchAction: string;
  submitPOD: string;
  deleteItem: string;
  // Messages
  loading: string;
  noData: string;
  error: string;
  success: string;
  offline: string;
  syncing: string;
  // POD
  proofOfDelivery: string;
  receivedBy: string;
  relation: string;
  capturePhoto: string;
  captureSignature: string;
  // Tracking page
  trackYourParcel: string;
  enterTrackingNumber: string;
  parcelNotFound: string;
  estimatedDelivery: string;
  actualDelivery: string;
  // NDPR
  ndprNotice: string;
};

const en: TranslationKeys = {
  dashboard: "Dashboard",
  parcels: "Parcels",
  newParcel: "New Parcel",
  tracking: "Tracking",
  dispatchNav: "Dispatch",
  reports: "Reports",
  settings: "Settings",
  trackingNumber: "Tracking Number",
  status: "Status",
  sender: "Sender",
  recipient: "Recipient",
  address: "Address",
  city: "City",
  state: "State",
  phone: "Phone",
  description: "Description",
  weight: "Weight (g)",
  deliveryFee: "Delivery Fee (NGN)",
  priority: "Priority",
  currency: "Currency",
  PENDING: "Pending",
  COLLECTED: "Collected",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  RETURNED: "Returned",
  STANDARD: "Standard",
  EXPRESS: "Express",
  SAME_DAY: "Same Day",
  create: "Create",
  save: "Save",
  cancel: "Cancel",
  search: "Search",
  track: "Track",
  dispatchAction: "Dispatch",
  submitPOD: "Submit Proof of Delivery",
  deleteItem: "Delete",
  loading: "Loading...",
  noData: "No data found",
  error: "An error occurred",
  success: "Success",
  offline: "You are offline. Changes will sync when connected.",
  syncing: "Syncing...",
  proofOfDelivery: "Proof of Delivery",
  receivedBy: "Received By",
  relation: "Relation to Recipient",
  capturePhoto: "Capture Photo",
  captureSignature: "Capture Signature",
  trackYourParcel: "Track Your Parcel",
  enterTrackingNumber: "Enter your tracking number",
  parcelNotFound: "Parcel not found. Please check the tracking number.",
  estimatedDelivery: "Estimated Delivery",
  actualDelivery: "Delivered On",
  ndprNotice:
    "Your personal data is processed in accordance with the Nigeria Data Protection Regulation (NDPR) 2019.",
};

const yo: TranslationKeys = {
  dashboard: "Ibi Isakoso",
  parcels: "Awon Eru",
  newParcel: "Eru Tuntun",
  tracking: "Itopinpin",
  dispatchNav: "Firanshe",
  reports: "Awon Ijabo",
  settings: "Eto",
  trackingNumber: "Nomba Itopinpin",
  status: "Ipo",
  sender: "Oluranshe",
  recipient: "Olugba",
  address: "Adiresii",
  city: "Ilu",
  state: "Ipinle",
  phone: "Foonu",
  description: "Apejuwe",
  weight: "Iwon (g)",
  deliveryFee: "Owo Firanshe (NGN)",
  priority: "Isanu",
  currency: "Owo",
  PENDING: "Nduro",
  COLLECTED: "Ti Gba",
  IN_TRANSIT: "Ni Ona",
  OUT_FOR_DELIVERY: "Jade fun Ifiranshe",
  DELIVERED: "Ti Firanshe",
  FAILED: "Ko Sishe",
  RETURNED: "Ti Pada",
  STANDARD: "Akoko",
  EXPRESS: "Iyara",
  SAME_DAY: "Ojo Kan Naa",
  create: "Sheda",
  save: "Pamo",
  cancel: "Fagile",
  search: "Wa",
  track: "Topinpin",
  dispatchAction: "Firanshe",
  submitPOD: "Fi Eri Ifiranshe Sile",
  deleteItem: "Pa re",
  loading: "N gbe...",
  noData: "Ko si data",
  error: "Asise kan wa",
  success: "Aseyori",
  offline: "O wa ni aisinipo. Awon ayipada yoo sogan nigbati o ba sopo.",
  syncing: "Sogan...",
  proofOfDelivery: "Eri Ifiranshe",
  receivedBy: "Ti Gba Nipashe",
  relation: "Ibatan si Olugba",
  capturePhoto: "Ya Foto",
  captureSignature: "Gba Ibuwolu",
  trackYourParcel: "Topinpin Eru Re",
  enterTrackingNumber: "Te nomba itopinpin re",
  parcelNotFound: "Eru ko ri. Jowo sayewo nomba itopinpin.",
  estimatedDelivery: "Ifiranshe Asotele",
  actualDelivery: "Ti Firanshe Ni",
  ndprNotice:
    "A she alaye data ara eni re ni ibamu pelu Ilana Idaaboboo Data Naijiria (NDPR) 2019.",
};

const ig: TranslationKeys = {
  dashboard: "Onodu Njikwa",
  parcels: "Ngwugwu",
  newParcel: "Ngwugwu Ohuru",
  tracking: "Nchoputa",
  dispatchNav: "Zipu",
  reports: "Akuko",
  settings: "Ntaala",
  trackingNumber: "Nomba Nchoputa",
  status: "Onodu",
  sender: "Onye Ziputara",
  recipient: "Onye Natara",
  address: "Adreesi",
  city: "Obodo",
  state: "Steeti",
  phone: "Ekwenti",
  description: "Nkowa",
  weight: "Ibu (g)",
  deliveryFee: "Ugwo Nnyefe (NGN)",
  priority: "Okachamara",
  currency: "Ego",
  PENDING: "Na-ato ulo",
  COLLECTED: "Achikotara",
  IN_TRANSIT: "N'uzo",
  OUT_FOR_DELIVERY: "Puo maka Nnyefe",
  DELIVERED: "Enye la",
  FAILED: "O dara ada",
  RETURNED: "Laghachiri",
  STANDARD: "Okolo to",
  EXPRESS: "Ngwa ngwa",
  SAME_DAY: "Otu Ubochi",
  create: "Mepu ta",
  save: "Chekwaa",
  cancel: "Kagbuo",
  search: "Choo",
  track: "Choputa",
  dispatchAction: "Zipu",
  submitPOD: "Nyefee Ihe Ama Nnyefe",
  deleteItem: "Hichapu",
  loading: "Na-ebu...",
  noData: "Enwegh i data",
  error: "O di njo",
  success: "O di mma",
  offline: "I no n'uzo. Mgbanwe ga-emechi mgbe i jikoo.",
  syncing: "Na-emechi...",
  proofOfDelivery: "Ihe Ama Nnyefe",
  receivedBy: "Onye Natara",
  relation: "Mmekori ta na Onye Natara",
  capturePhoto: "Wepu ta Foto",
  captureSignature: "Nata Mbinuaka",
  trackYourParcel: "Choputa Ngwugwu Gi",
  enterTrackingNumber: "Tinye nomba nchoputa gi",
  parcelNotFound: "Ahugh i ngwugwu. Biko lelee nomba nchoputa.",
  estimatedDelivery: "Nnyefe Atumatu",
  actualDelivery: "Enyere na",
  ndprNotice:
    "Ana-ahua maka data onwe gi di ka Iwu Nchedo Data Nigeria (NDPR) 2019 si di.",
};

const ha: TranslationKeys = {
  dashboard: "Allon Kula",
  parcels: "Fakiti",
  newParcel: "Sabon Fakiti",
  tracking: "Bin Diddi",
  dispatchNav: "Aika",
  reports: "Rahotanni",
  settings: "Saituna",
  trackingNumber: "Lambar Bin Diddi",
  status: "Matsayi",
  sender: "Mai Aika",
  recipient: "Mai Karba",
  address: "Adireshi",
  city: "Birni",
  state: "Jiha",
  phone: "Waya",
  description: "Bayani",
  weight: "Nauyi (g)",
  deliveryFee: "Kudin Isar da Kaya (NGN)",
  priority: "Fifiko",
  currency: "Kudi",
  PENDING: "Ana Jira",
  COLLECTED: "An Karba",
  IN_TRANSIT: "A Hanya",
  OUT_FOR_DELIVERY: "Fita don Isar da Kaya",
  DELIVERED: "An Isar",
  FAILED: "Ya Kasa",
  RETURNED: "An Mayar",
  STANDARD: "Na Yau da Kullum",
  EXPRESS: "Mai Sauri",
  SAME_DAY: "Wannan Rana",
  create: "Kirkira",
  save: "Ajiye",
  cancel: "Soke",
  search: "Nema",
  track: "Bin Diddi",
  dispatchAction: "Aika",
  submitPOD: "Mika Shaidar Isar da Kaya",
  deleteItem: "Goge",
  loading: "Ana Lodi...",
  noData: "Babu bayani",
  error: "An sami kuskure",
  success: "Ya yi nasara",
  offline: "Kana offline. Canje-canje za su daidaita lokacin da aka hada.",
  syncing: "Ana daidaitawa...",
  proofOfDelivery: "Shaida ta Isar da Kaya",
  receivedBy: "Wanda Ya Karba",
  relation: "Dangantaka da Mai Karba",
  capturePhoto: "Dauki Hoto",
  captureSignature: "Dauki Sa-hannu",
  trackYourParcel: "Bin Diddin Fakitinka",
  enterTrackingNumber: "Shigar da lambar bin diddi",
  parcelNotFound: "Ba a sami fakiti ba. Da fatan za a duba lambar bin diddi.",
  estimatedDelivery: "Lokacin Isar da Kaya da ake Tsammani",
  actualDelivery: "An Isar a",
  ndprNotice:
    "Ana sarrafa bayananku na sirri bisa ga Dokar Kare Bayanan Nigeria (NDPR) 2019.",
};

const translations: Record<Locale, TranslationKeys> = { en, yo, ig, ha };

export function getTranslations(locale: Locale): TranslationKeys {
  return translations[locale] ?? translations.en;
}

/** Format a kobo amount as a human-readable currency string [Part 9.2 — Nigeria First] */
export function formatKobo(kobo: number, currency = "NGN", locale: Locale = "en"): string {
  const amount = kobo / 100;
  const localeMap: Record<Locale, string> = {
    en: "en-NG",
    yo: "en-NG",
    ig: "en-NG",
    ha: "en-NG",
  };
  return new Intl.NumberFormat(localeMap[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a UTC timestamp in WAT (West Africa Time, UTC+1) [Part 9.1 — Nigeria First]
 * All timestamps displayed in Africa/Lagos timezone.
 */
export function formatWAT(date: Date | string | null | undefined, locale: Locale = "en"): string {
  if (!date) return "\u2014";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
