export function opwProductUrl(code: string): string {
  return `https://online-price-watch.consumer.org.hk/opw/product/${encodeURIComponent(code)}`;
}

export function opwSearchUrl(query: string): string {
  return `https://online-price-watch.consumer.org.hk/opw/search/${encodeURIComponent(query)}`;
}

export function priceHkSearchUrl(query: string): string {
  const params = new URLSearchParams({ g: "A", q: query });
  return `https://www.price.com.hk/search.php?${params.toString()}`;
}

export function pnsSearchUrl(query: string): string {
  return `https://www.pns.hk/zh-hk/search?text=${encodeURIComponent(query)}`;
}

export function wellcomeSearchUrl(query: string): string {
  return `https://www.wellcome.com.hk/search?keyword=${encodeURIComponent(query)}`;
}

export function hktvSearchUrl(query: string): string {
  return `https://www.hktvmall.com/hktv/zh/search_a?keyword=${encodeURIComponent(query)}`;
}

export function marketplaceSearchUrl(query: string): string {
  return `https://www.marketplacehk.com/search?keyword=${encodeURIComponent(query)}`;
}

export function googleSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query.trim() });
  return `https://www.google.com/search?${params.toString()}`;
}

export function openGoogleSearch(query: string, name = "gaakgaai-google"): void {
  const q = query.trim();
  if (!q || typeof window === "undefined") return;
  window.open(googleSearchUrl(q), name, "noopener,noreferrer,width=1080,height=780");
}

export function externalLinks(query: string) {
  return {
    opwSearchUrl: opwSearchUrl(query),
    priceHkUrl: priceHkSearchUrl(query),
    pnsSearchUrl: pnsSearchUrl(query),
    wellcomeSearchUrl: wellcomeSearchUrl(query),
    hktvSearchUrl: hktvSearchUrl(query),
    marketplaceSearchUrl: marketplaceSearchUrl(query),
    googleSearchUrl: googleSearchUrl(query),
  };
}
