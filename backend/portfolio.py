"""本地持仓账本：购买/清仓交易驱动当前持仓，并叠加实时行情。"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
import json
import os
import shutil
import sys
import threading
import time
from datetime import datetime, timezone, timedelta

import astock
import gstock

HERE = os.path.dirname(os.path.abspath(__file__))
_OLD_PF_FILE = os.path.join(HERE, ".cache", "portfolio.json")
CACHE_DIR = os.environ.get("VR_DATA_DIR") or os.path.join(os.path.expanduser("~"), ".vibe-research")
PF_FILE = os.path.join(CACHE_DIR, "portfolio.json")
BEIJING = timezone(timedelta(hours=8))
_LOCK = threading.Lock()
# 账本内部统一保留 4 位小数；页面层负责以 2 位小数展示。
_MONEY = Decimal("0.0001")
_PRICE = Decimal("0.0001")


def normalize_code(code: str) -> tuple[str, str]:
    """规范化持仓代码，并返回其市场原生币种。"""
    raw = (code or "").strip().upper()
    if raw.isdigit() and len(raw) == 6:
        return raw, "CNY"
    normalized, _country, currency = gstock.normalize_symbol(raw)
    return normalized, currency


def _money(value: object) -> Decimal:
    return Decimal(str(value)).quantize(_MONEY, rounding=ROUND_HALF_UP)


def _price(value: object) -> Decimal:
    return Decimal(str(value)).quantize(_PRICE, rounding=ROUND_HALF_UP)


def _number(value: object) -> Decimal:
    return Decimal(str(value))


def _as_float(value: Decimal) -> float:
    return float(value)


def _now() -> str:
    return datetime.now(BEIJING).strftime("%Y-%m-%d %H:%M")


def _migrate_legacy() -> None:
    try:
        if not os.path.exists(PF_FILE) and os.path.exists(_OLD_PF_FILE):
            os.makedirs(CACHE_DIR, exist_ok=True)
            tmp = PF_FILE + ".migrate.tmp"
            shutil.copy2(_OLD_PF_FILE, tmp)
            os.replace(tmp, PF_FILE)
    except OSError as e:
        print(f"[vibe-research] 持仓数据迁移失败（旧数据仍在 {_OLD_PF_FILE}）: {e}", file=sys.stderr)


_migrate_legacy()


def _upgrade(d: dict) -> tuple[dict, bool]:
    """将旧聚合持仓升级为交易账本；不伪造无法得知的买入日期。"""
    changed = False
    d.setdefault("holdings", [])
    d.setdefault("last_refresh", None)
    if "purchases" not in d:
        d["purchases"] = []
        changed = True

    for holding in d["holdings"]:
        code, currency = normalize_code(holding["code"])
        if holding.get("code") != code:
            holding["code"] = code
            changed = True
        if holding.get("currency") != currency:
            holding["currency"] = currency
            changed = True
        if "total_cost" not in holding:
            shares = _number(holding.get("shares", 0))
            unit_cost = _price(holding.get("cost", 0))
            total_cost = _money(shares * unit_cost)
            holding.update({"name": holding.get("name") or code, "total_cost": _as_float(total_cost), "cost": _as_float(unit_cost)})
            d["purchases"].append({
                "code": code, "name": holding["name"], "date": "历史导入", "price": _as_float(unit_cost),
                "shares": _as_float(shares), "total_cost": _as_float(total_cost), "currency": currency,
            })
            changed = True

    for closed in d.get("closed", []):
        code, currency = normalize_code(closed["code"])
        if closed.get("code") != code:
            closed["code"] = code
            changed = True
        if closed.get("currency") != currency:
            closed["currency"] = currency
            changed = True
        if "amount" not in closed or "total_cost" not in closed:
            shares = _number(closed.get("shares", 0))
            price = _price(closed.get("price", 0))
            unit_cost = _price(closed.get("cost", 0))
            amount, total_cost = _money(price * shares), _money(unit_cost * shares)
            pnl = _money(amount - total_cost)
            closed.update({
                "price": _as_float(price), "amount": _as_float(amount), "total_cost": _as_float(total_cost),
                "pnl": _as_float(pnl), "pnl_pct": _as_float((pnl / total_cost * 100).quantize(_MONEY, rounding=ROUND_HALF_UP)) if total_cost else 0.0,
            })
            changed = True

    if d.get("schema_version") != 2:
        d["schema_version"] = 2
        changed = True
    return d, changed


def _load() -> dict:
    try:
        with open(PF_FILE, encoding="utf-8") as f:
            d = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"schema_version": 2, "holdings": [], "purchases": [], "closed": [], "last_refresh": None}
    d, changed = _upgrade(d)
    if changed:
        _save(d)
    return d


def _save(d: dict) -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = PF_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, PF_FILE)


def _security_name(code: str, currency: str) -> str:
    try:
        if currency == "CNY":
            return astock.tencent_quote([code]).get(code, {}).get("name", code)
        return gstock.stock_quote(code).get("name", code)
    except Exception:
        return code


def add_holding(code: str, date: str, shares: float, total_cost: float) -> dict:
    """登记一笔购买交易，并原子更新当前持仓。"""
    code, currency = normalize_code(code)
    quantity, amount = _number(shares), _money(total_cost)
    unit_price = _price(amount / quantity)
    with _LOCK:
        d = _load()
        name = _security_name(code, currency)
        holding = next((h for h in d["holdings"] if h["code"] == code), None)
        if holding:
            new_shares = _number(holding["shares"]) + quantity
            new_cost = _money(_number(holding["total_cost"]) + amount)
            holding.update({"shares": _as_float(new_shares), "total_cost": _as_float(new_cost), "cost": _as_float(_price(new_cost / new_shares))})
        else:
            d["holdings"].append({
                "code": code, "name": name, "shares": _as_float(quantity), "total_cost": _as_float(amount),
                "cost": _as_float(unit_price), "currency": currency,
            })
        d.setdefault("purchases", []).append({
            "code": code, "name": name, "date": date, "price": _as_float(unit_price), "shares": _as_float(quantity),
            "total_cost": _as_float(amount), "currency": currency,
        })
        _save(d)
    return get_portfolio()


def close_position(code: str, date: str, shares: float, amount: float) -> dict:
    """登记一笔清仓交易，按提交时成本均价扣减当前仓位并保存成本快照。"""
    code, currency = normalize_code(code)
    quantity, proceeds = _number(shares), _money(amount)
    with _LOCK:
        d = _load()
        holding = next((h for h in d["holdings"] if h["code"] == code), None)
        if not holding:
            raise ValueError("该证券没有可清仓的当前持仓")
        current_shares = _number(holding["shares"])
        if quantity > current_shares:
            raise ValueError("清仓股数不能超过当前持仓股数")
        unit_cost = _price(holding["cost"])
        total_cost = _money(unit_cost * quantity)
        unit_price = _price(proceeds / quantity)
        pnl = _money(proceeds - total_cost)
        remaining_shares = current_shares - quantity
        if remaining_shares == 0:
            d["holdings"] = [h for h in d["holdings"] if h["code"] != code]
        else:
            remaining_cost = _money(_number(holding["total_cost"]) - total_cost)
            holding.update({
                "shares": _as_float(remaining_shares), "total_cost": _as_float(remaining_cost),
                "cost": _as_float(_price(remaining_cost / remaining_shares)),
            })
        d.setdefault("closed", []).append({
            "code": code, "name": holding.get("name") or code, "date": date, "price": _as_float(unit_price),
            "shares": _as_float(quantity), "amount": _as_float(proceeds), "total_cost": _as_float(total_cost),
            "pnl": _as_float(pnl), "pnl_pct": _as_float((pnl / total_cost * 100).quantize(_MONEY, rounding=ROUND_HALF_UP)) if total_cost else 0.0,
            "currency": currency,
        })
        _save(d)
    return get_portfolio()


def get_portfolio() -> dict:
    """读取当前持仓，行情字段实时计算；账本字段均为提交时已固化的数据。"""
    with _LOCK:
        d = _load()
    holdings = d.get("holdings", [])
    rows: list[dict] = []
    totals: dict[str, dict[str, float]] = {}
    a_codes = [h["code"] for h in holdings if normalize_code(h["code"])[1] == "CNY"]
    try:
        quotes = astock.tencent_quote(a_codes) if a_codes else {}
    except Exception:
        quotes = {}

    for holding in holdings:
        code, currency = normalize_code(holding["code"])
        if currency == "CNY":
            quote = quotes.get(code, {})
            name, price = quote.get("name", holding.get("name", code)), quote.get("price", 0.0)
        else:
            try:
                stock = gstock.stock_quote(code)
                quote = stock.get("quote") or {}
                name, price = stock.get("name", holding.get("name", code)), quote.get("price") or 0.0
            except Exception:
                name, price = holding.get("name", code), 0.0
        shares, total_cost = _number(holding["shares"]), _money(holding["total_cost"])
        market_value = _money(_number(price) * shares)
        pnl = _money(market_value - total_cost)
        rows.append({
            "code": code, "name": name, "price": _as_float(_price(price)), "shares": _as_float(shares),
            "cost": _as_float(_price(holding["cost"])), "total_cost": _as_float(total_cost),
            "market_value": _as_float(market_value), "pnl": _as_float(pnl),
            "pnl_pct": _as_float((pnl / total_cost * 100).quantize(_MONEY, rounding=ROUND_HALF_UP)) if total_cost else 0.0,
            "currency": currency,
        })
        total = totals.setdefault(currency, {"market_value": 0.0, "cost": 0.0})
        total["market_value"] = _as_float(_money(_number(total["market_value"]) + market_value))
        total["cost"] = _as_float(_money(_number(total["cost"]) + total_cost))

    for total in totals.values():
        market_value, total_cost = _money(total["market_value"]), _money(total["cost"])
        pnl = _money(market_value - total_cost)
        total["pnl"] = _as_float(pnl)
        total["pnl_pct"] = _as_float((pnl / total_cost * 100).quantize(_MONEY, rounding=ROUND_HALF_UP)) if total_cost else 0.0

    purchases = list(d.get("purchases", []))
    closed = list(d.get("closed", []))
    realized: dict[str, float] = {}
    for item in closed:
        currency = item.get("currency") or normalize_code(item["code"])[1]
        realized[currency] = _as_float(_money(_number(realized.get(currency, 0)) + _money(item.get("pnl", 0))))
    return {
        "holdings": rows, "purchases": purchases, "totals": totals, "closed": closed,
        "realized_pnl": realized, "updated": _now(), "last_refresh": d.get("last_refresh"),
    }


def _refresh_snapshot() -> None:
    with _LOCK:
        d = _load()
        d["last_refresh"] = _now()
        _save(d)


def start_scheduler(interval: int = 1800) -> None:
    def loop():
        while True:
            time.sleep(interval)
            try:
                _refresh_snapshot()
            except Exception:
                pass
    threading.Thread(target=loop, daemon=True).start()
