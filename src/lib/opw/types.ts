export const STORE_IDS = [
  "WELLCOME",
  "PARKNSHOP",
  "JASONS",
  "AEON",
  "WATSONS",
  "MANNINGS",
  "LUNGFUNG",
  "DCHFOOD",
  "SASA",
  "HKTV",
  "PRICEHK",
  "OTHER",
] as const;

export type StoreId = (typeof STORE_IDS)[number];

export type LangText = {
  en: string;
  "zh-Hant": string;
  "zh-Hans": string;
};

export type RawPrice = {
  supermarketCode: string;
  price: string | number;
};

export type RawOffer = {
  supermarketCode: string;
  en?: string;
  "zh-Hant"?: string;
  "zh-Hans"?: string;
};

export type RawProduct = {
  code: string;
  brand: LangText;
  name: LangText;
  cat1Name?: LangText;
  cat2Name?: LangText;
  cat3Name?: LangText;
  prices?: RawPrice[];
  offers?: RawOffer[];
};

export type StorePrice = {
  store: StoreId;
  unitPrice: number;
  offer: string | null;
  shop?: string;
};

export type ProductSource = "opw" | "hktv" | "wellcome" | "marketplace" | "pricehk" | "custom";

export type ProductView = {
  code: string;
  brand: string;
  name: string;
  brandEn: string;
  nameEn: string;
  category: string;
  url: string;
  prices: StorePrice[];
  source?: ProductSource;
};

export type ListLine = {
  id: string;
  query: string;
  qty: number;
};

export type PickReason = "query-size" | "best-unit" | "best-match" | "alt-size";

export type MoreSourceId = "hktv" | "wellcome" | "marketplace" | "pricehk";

export type MoreSourceHit = {
  id: MoreSourceId;
  label: string;
  count: number;
  url: string;
  blocked?: boolean;
};

export type ExternalLinks = {
  opwSearchUrl: string;
  priceHkUrl: string;
  pnsSearchUrl: string;
  wellcomeSearchUrl: string;
  hktvSearchUrl: string;
  marketplaceSearchUrl: string;
  googleSearchUrl: string;
};

export type MatchedLine = {
  id: string;
  query: string;
  qty: number;
  confidence: number;
  autoSelected: boolean;
  pickReason: PickReason | null;
  match: ProductView | null;
  candidates: ProductView[];
  moreSearched?: boolean;
  moreRound?: number;
  moreSources?: MoreSourceHit[];
  external: ExternalLinks;
};

export type CatalogMeta = {
  count: number;
  updatedAt: string | null;
  ready: boolean;
};
