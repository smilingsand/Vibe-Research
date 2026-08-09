// 自选证券仅存于本地 localStorage。A 股走 /api/quote，海外证券走 /api/global/stock。
import { api, type Quote } from "@/lib/api";

const KEY = "vr-watchlist";
const A_SHARE_RE = /^\d{6}$/;
const US_RE = /^[A-Z][A-Z0-9.-]{0,15}\.US$/;
const HK_RE = /^(\d{1,5})\.HK$/;
const KR_RE = /^\d{6}\.KR$/;

export interface WatchQuote {
  name: string;
  price: number | null;
  change_pct: number | null;
  pe_ttm?: number | null;
  pb?: number | null;
  turnover_pct?: number | null;
}

export const isAShareCode = (code: string) => A_SHARE_RE.test(code);

export function normalizeWatchCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (A_SHARE_RE.test(code) || US_RE.test(code) || KR_RE.test(code)) return code;
  const hk = HK_RE.exec(code);
  return hk ? `${hk[1].padStart(5, "0")}.HK` : null;
}

export function loadWatch(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((code) => normalizeWatchCode(String(code))).filter(Boolean))) as string[];
  } catch {
    return [];
  }
}

export function saveWatch(codes: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(codes));
  } catch {
    /* 存储不可用时，本次页面会话仍可使用。 */
  }
}

/** 支持 A 股、.US、.HK、.KR；空格、逗号、分号和换行均可分隔。 */
export function parseCodes(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,;；]+/).map(normalizeWatchCode).filter(Boolean))) as string[];
}

export function addCodes(existing: string[], raw: string): { next: string[]; added: number } {
  const incoming = parseCodes(raw).filter((code) => !existing.includes(code));
  return { next: [...existing, ...incoming], added: incoming.length };
}

/** 按市场获取自选行情；单只海外证券失败不阻断其它标的。 */
export async function fetchWatchQuotes(codes: string[]): Promise<Record<string, WatchQuote>> {
  const out: Record<string, WatchQuote> = {};
  const aShares = codes.filter(isAShareCode);
  if (aShares.length) {
    try {
      const quotes = await api.quote(aShares.join(","));
      for (const [code, quote] of Object.entries(quotes)) {
        const q: Quote = quote;
        out[code] = {
          name: q.name, price: q.price, change_pct: q.change_pct,
          pe_ttm: q.pe_ttm, pb: q.pb, turnover_pct: q.turnover_pct,
        };
      }
    } catch {
      /* A 股行情不可用时仍继续请求海外行情。 */
    }
  }
  await Promise.all(codes.filter((code) => !isAShareCode(code)).map(async (code) => {
    try {
      const stock = await api.globalStock(code);
      out[code] = { name: stock.name, price: stock.quote.price, change_pct: stock.quote.change_pct };
    } catch {
      /* 单只海外证券失败不阻断其它自选。 */
    }
  }));
  return out;
}
