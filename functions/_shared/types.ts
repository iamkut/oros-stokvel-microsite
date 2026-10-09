export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  DAILY_SALT: string;
  CAMPAIGN: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

export interface EntryPayload {
  name?: string;
  phone?: string;
  flavour?: string;
  province?: string;
  store?: string;
  optIn?: boolean;
  consent?: boolean;
  turnstileToken?: string;
  website?: string;
  elapsedMs?: number;
}

export const FLAVOURS = [
  'Orange', 'Tropical', 'Guava', 'Lemos', 'Naartjie', 'Mango', 'Pineapple', 'Passionfruit'
];

export const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape'
];

export const OTHER_STORE = 'Other';

export const STORES_BY_PROVINCE: Record<string, string[]> = {
  'Eastern Cape': [
    'Trade Value',
    'Afri-save Kariega',
    'Trade Value Gqeberha',
    'Broadway Gqeberha'
  ],
  'Free State': [
    'Bibi Cash & Carry - Qwaqwa',
    'Devland Cash & Carry Welkom',
    'TFS Bloemfontein',
    'Transito Cash & Carry Welkom'
  ],
  'Gauteng': [
    'Devland Cash & Carry Johannesburg',
    'Advance Pretoria',
    'Kit Kat Pretoria West',
    'Kit Kat Silverton',
    'Kit Kat Benoni',
    'Kit Kat Mamelodi',
    'Kit Kat Kliptown',
    'Big Save Waltloo',
    'Big Save Mabopane',
    'Big Save Hammanskraal',
    'Big Save Tshwane Market',
    'Big Save Marble Hall',
    'Hazyview Cash & Carry',
    'Savemoor Cash & Carry',
    'Savemoor Tembisa',
    'Sunshine Westgate',
    'Sunshine Electron',
    'Sunshine Plaza',
    'Devland Springs',
    'Makro Germiston',
    'Makro Riversands',
    'Makro Crown Mines'
  ],
  'KwaZulu-Natal': [
    'Trade Port - Phoenix',
    'Bargain Wholesaler',
    'Phoenix Cash & Carry - Empangeni',
    'Supersave PMB',
    'Macksons uMzimkhulu',
    'Phoenix Cash & Carry - Pietermaritzburg',
    'Phoenix Cash & Carry - Prospecton',
    'Jadwats',
    'Makro Amanzimtoti'
  ],
  'Limpopo': [
    'Kismat Cash & Carry'
  ],
  'Mpumalanga': [
    'Happy Family Witbank',
    'Goldfields Witbank',
    'Devland Ermelo',
    'Otees Cash & Carry'
  ],
  'Northern Cape': [],
  'North West': [
    'Food Town Hyper Thlabane Monareng Street',
    'Three Star Cash & Carry Rustenburg',
    'Trans Food Town Hyper Klopper Street',
    'Powertrade Kuruman',
    'Powertrade Vryburg Cash & Carry'
  ],
  'Western Cape': [
    'Foodtown Hyper Khayelitsha',
    'Makro Ottery'
  ]
};

export function isValidStore(province: string, store: string): boolean {
  if (store === OTHER_STORE) return true;
  const list = STORES_BY_PROVINCE[province];
  return Array.isArray(list) && list.includes(store);
}
