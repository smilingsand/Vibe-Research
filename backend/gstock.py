"""美股 / 港股 / 韩股数据层 —— 移植自 global-stock-data（海外股票工具包）。

只并入「域内(东财)」的合规子集：全球指数 + 美港股行情 + 关键财务指标。
用途＝A 股「看隔夜外围脸色」+ 个股页支持美港股代码。

工程要点：
- 东财调用全部复用 `astock.em_get`（直连优先、避开用户 Clash 代理挂国内站）+
  `astock.eastmoney_datacenter`（datacenter 三表/指标已封装）。
- push2 stock/get 直连偶发掉连 → **push2 优先、失败降级 push2delay**（延时行情，研究场景足够），
  latch 到可用主机整进程复用（同成交额榜的做法）。
- Yahoo / SEC 等国外源不并入（需科学上网、且非必要）。

合规：只做客观数据整理，不预置标的、不推荐、不预测。
"""

from __future__ import annotations

import re

import astock
from runtime_config import GLOBAL_INDICES

_UA_H = {"User-Agent": astock.UA}
_GS_HOSTS = ("push2.eastmoney.com", "push2delay.eastmoney.com")
_gs_host = [0]  # 当前可用主机下标；首次 push2 掉连后 latch 到 push2delay

# 全球指数（东财 push2 secid；由 backend_config.json 在启动时读取）。
_INDICES = tuple(index for index in GLOBAL_INDICES if index["source"] == "eastmoney")

# 用户国家后缀 → 东方财富内部市场编号/财务代码后缀。
# 若东财调整这些内部关系，只在此处维护；用户输入不暴露这些编号。
_COUNTRY_MARKETS = {
    "US": (
        {"prefix": 105, "market": "NASDAQ", "secucode_suffix": ".O"},
        {"prefix": 106, "market": "NYSE", "secucode_suffix": ".N"},
        {"prefix": 107, "market": "US", "secucode_suffix": ".O"},
    ),
    "HK": ({"prefix": 116, "market": "HK", "secucode_suffix": ".HK"},),
    "KR": ({"prefix": 177, "market": "KR", "secucode_suffix": ".KS"},),
}

_US_INPUT_RE = re.compile(r"^([A-Z][A-Z0-9.-]{0,15})\.US$")
_HK_INPUT_RE = re.compile(r"^(\d{1,5})\.HK$")
_KR_INPUT_RE = re.compile(r"^(\d{6})\.KR$")

_QUOTE_FIELDS = "f43,f44,f45,f46,f48,f57,f58,f59,f60,f116,f170"


def _push2_stock_get(secid: str, fields: str) -> dict | None:
    """东财 push2 stock/get：push2 优先、失败降级 push2delay；latch 可用主机。空数据返回 None。"""
    params = {"secid": secid, "fields": fields}
    for i in range(_gs_host[0], len(_GS_HOSTS)):
        try:
            r = astock.em_get(f"https://{_GS_HOSTS[i]}/api/qt/stock/get",
                              params=params, headers=_UA_H, timeout=10)
            d = r.json().get("data")
        except Exception:
            continue
        if d:
            _gs_host[0] = i
            return d
    return None


def _price(d: dict, key: str):
    """f43 等价格字段：除以 10^f59 还原。'-' / None → None。"""
    v = d.get(key)
    if not isinstance(v, (int, float)):
        return None
    dec = d.get("f59")
    if not isinstance(dec, int):  # 注意：不能用 `or 2`——韩元等 f59=0 会被误判成 2，价格被多除 100 倍
        dec = 2
    return round(v / (10 ** dec), dec)


def _quote_from(d: dict) -> dict:
    chg = d.get("f170")
    return {
        "code": d.get("f57"), "name": d.get("f58"),
        "price": _price(d, "f43"), "open": _price(d, "f46"),
        "high": _price(d, "f44"), "low": _price(d, "f45"),
        "prev_close": _price(d, "f60"),
        "amount": d.get("f48") if isinstance(d.get("f48"), (int, float)) else None,
        "mcap": d.get("f116") if isinstance(d.get("f116"), (int, float)) and d.get("f116") else None,
        "change_pct": round(chg / 100, 2) if isinstance(chg, (int, float)) else None,
    }


def global_indices() -> list[dict]:
    """全球指数快照（道指 / 标普500 / 纳斯达克 / 恒生 / 恒生科技）。源无的档跳过。"""
    out = []
    for idx in _INDICES:
        d = _push2_stock_get(idx["secid"], "f43,f57,f58,f59,f60,f170")
        if not d:
            continue
        chg = d.get("f170")
        out.append({
            "key": idx["key"], "name": idx["name"], "region": idx["region"],
            "price": _price(d, "f43"),
            "change_pct": round(chg / 100, 2) if isinstance(chg, (int, float)) else None,
        })
    return out


class SymbolInputError(ValueError):
    """海外证券输入不符合本系统的国家后缀约定。"""


def _parse_symbol(query: str) -> tuple[str, str]:
    """解析用户输入为 (国家后缀, 东财证券代码)，不调用搜索接口。"""
    q = query.strip().upper()
    m = _US_INPUT_RE.fullmatch(q)
    if m:
        return "US", m.group(1)
    m = _HK_INPUT_RE.fullmatch(q)
    if m:
        return "HK", m.group(1).zfill(5)
    m = _KR_INPUT_RE.fullmatch(q)
    if m:
        return "KR", m.group(1)
    raise SymbolInputError("海外代码格式应为 AAPL.US（美股）、00700.HK（港股）或 005930.KR（韩股）")


def normalize_symbol(query: str) -> tuple[str, str, str]:
    """返回持久化/展示均可使用的规范代码、国家和原生币种。"""
    country, code = _parse_symbol(query)
    return f"{code}.{country}", country, {"US": "USD", "HK": "HKD", "KR": "KRW"}[country]


def _resolve_stock(query: str) -> tuple[dict, dict] | None:
    """按国家后缀构造确定的东财请求；美股仅在已知美国市场编号内有界尝试。"""
    country, code = _parse_symbol(query)
    for spec in _COUNTRY_MARKETS[country]:
        data = _push2_stock_get(f"{spec['prefix']}.{code}", _QUOTE_FIELDS)
        if not data or str(data.get("f57") or "").upper() != code:
            continue
        return ({
            "code": code,
            "name": data.get("f58") or code,
            "secid_prefix": spec["prefix"],
            "secucode": f"{code}{spec['secucode_suffix']}",
            "market": spec["market"],
        }, data)
    return None


def _key_metrics(secucode: str) -> dict | None:
    """东财 GMAININDICATOR 最新一期关键财务指标（美股/港股中文字段）。"""
    market = "HK" if secucode.endswith(".HK") else "US"
    rows = astock.eastmoney_datacenter(
        f"RPT_{market}F10_FN_GMAININDICATOR",
        filter_str=f'(SECUCODE="{secucode}")',
        page_size=1, sort_columns="REPORT_DATE", sort_types="-1")
    if not rows:
        return None
    m = rows[0]
    return {
        "report_date": str(m.get("REPORT_DATE") or "")[:10],
        "revenue": m.get("OPERATE_INCOME"),
        "revenue_yoy": m.get("OPERATE_INCOME_YOY"),
        "net_profit": m.get("PARENT_HOLDER_NETPROFIT") or m.get("HOLDER_PROFIT"),
        "eps": m.get("BASIC_EPS"),
        "roe": m.get("ROE_AVG"),
        "gross_margin": m.get("GROSS_PROFIT_RATIO"),
        "net_margin": m.get("NET_PROFIT_RATIO"),
        "debt_ratio": m.get("DEBT_ASSET_RATIO"),
    }


def stock_quote(query: str) -> dict:
    """海外证券轻量行情：仅取名称、市场和行情，不读取财务指标。"""
    resolved = _resolve_stock(query)
    if not resolved:
        return {}
    info, data = resolved
    quote = _quote_from(data)
    return {
        "code": info["code"],
        "name": info["name"] or quote.get("name") or info["code"],
        "market": info["market"],
        "quote": quote,
    }


def us_hk_stock(query: str) -> dict:
    """海外个股聚合：按国家后缀解析代码 → 行情 + 关键财务指标。"""
    resolved = _resolve_stock(query)
    if not resolved:
        return {}
    info, data = resolved
    quote = _quote_from(data)
    return {
        "code": info["code"],
        "name": info["name"] or quote.get("name") or info["code"],
        "market": info["market"],
        "quote": quote,
        "metrics": _key_metrics(info["secucode"]) if info["market"] != "KR" else None,  # 韩股东财无 F10 财务
    }


# 港股现金流量表汇总科目：东财 RPT_HKSK_FN_CASHFLOW 的 STD_ITEM_CODE → 中文标签。
# 用稳定数字码作 key（不用东财中文 ITEM_NAME，避开其编码/措辞差异）；实测每期返回这 8 行汇总。
_HK_CF_ITEMS = {
    "003999": "经营活动现金流净额",
    "005999": "投资活动现金流净额",
    "007999": "筹资活动现金流净额",
    "006999": "汇率变动前现金净额",
    "011997": "汇率变动等其他影响",
    "010999": "现金及等价物净增加",
    "011001": "期初现金及等价物",
    "011999": "期末现金及等价物",
}
_HK_CF_ORDER = ("003999", "005999", "007999", "006999", "011997", "010999", "011001", "011999")


def hk_cashflow(query: str, periods: int = 8) -> dict:
    """港股现金流量表（东财 datacenter RPT_HKSK_FN_CASHFLOW，与已接入 GMAININDICATOR 同为东财域内源）。

    按 REPORT_DATE 分组还原每期汇总（经营 / 投资 / 筹资 / 净增加 / 期初期末），返回最近 `periods` 期。
    金额为原生币种（见 `currency`，港股多为人民币或港元），季度为 YTD 累计、附同比。
    非港股（美/韩股，其现金流走 F10/SK 或无）或查不到 → 返回 {}。
    """
    country, code = _parse_symbol(query)
    if country != "HK":
        return {}
    spec = _COUNTRY_MARKETS["HK"][0]
    quote = _push2_stock_get(f"{spec['prefix']}.{code}", "f57,f58")
    info = {
        "code": code,
        # 现金流端点不返回证券简称，补一次确定的港股行情查询以保留原有名称字段。
        "name": quote.get("f58") if quote and str(quote.get("f57") or "") == code else code,
        "secucode": f"{code}{spec['secucode_suffix']}",
    }
    # ⚠️ 该端点是**按科目逐行**返回的，一期就有几十行（实测腾讯 00700 最多 52 行/期、
    # 工行 01398 38 行/期）。只按 SECUCODE 取 300 行，最新 8 期根本装不下——
    # 最旧的那期会被截断成残缺科目，而且不报错。所以在**服务端**就按需要的科目码过滤：
    # 实测同样 300 行，覆盖期数从 13 期升到 39 期，请求量反而更小。
    item_filter = "(STD_ITEM_CODE in (" + ",".join(f'"{c}"' for c in _HK_CF_ORDER) + "))"
    rows = astock.eastmoney_datacenter(
        "RPT_HKSK_FN_CASHFLOW",
        filter_str=f'(SECUCODE="{info["secucode"]}"){item_filter}',
        page_size=300, sort_columns="REPORT_DATE", sort_types="-1")
    if not rows:
        return {}
    by_period: dict[str, dict] = {}
    for r in rows:
        rd = str(r.get("REPORT_DATE") or "")[:10]
        code = str(r.get("STD_ITEM_CODE") or "")
        if not rd or code not in _HK_CF_ITEMS:
            continue
        p = by_period.setdefault(rd, {
            "report_date": rd, "report": r.get("REPORT"),
            "currency": r.get("CURRENCY"), "account_standard": r.get("ACCOUNT_STANDARD"),
            "items": {},
        })
        amt, yoy = r.get("AMOUNT"), r.get("YOY_RATIO")
        p["items"][_HK_CF_ITEMS[code]] = {
            "amount": amt if isinstance(amt, (int, float)) else None,
            "yoy": yoy if isinstance(yoy, (int, float)) else None,
        }
    if not by_period:
        return {}
    periods_out = sorted(by_period.values(), key=lambda x: x["report_date"], reverse=True)[:periods]
    return {
        "code": info["code"], "name": info["name"], "market": "HK",
        "currency": periods_out[0].get("currency"),
        "item_order": [_HK_CF_ITEMS[c] for c in _HK_CF_ORDER],
        "periods": periods_out,
    }
