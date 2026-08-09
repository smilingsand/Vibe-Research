"""API 验证/契约测（FastAPI TestClient）。大多在校验层就返回，不联网、可靠。"""
import pytest
from fastapi.testclient import TestClient

import app as app_module
import newsradar

client = TestClient(app_module.app)


@pytest.fixture()
def stock_cache():
    """隔离进程内个股 TTL/LRU 缓存，避免测试之间共享命中。"""
    with app_module._STOCK_CACHE_LOCK:
        app_module._STOCK_CACHE.clear()
    yield
    with app_module._STOCK_CACHE_LOCK:
        app_module._STOCK_CACHE.clear()


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


@pytest.mark.parametrize("path", [
    "/api/quote?codes=abc",
    "/api/valuation?code=12",
    "/api/margin?code=notcode",
    "/api/holders?code=1234567",
    "/api/announcements?code=",
])
def test_bad_code_400(path):
    assert client.get(path).status_code == 400


def test_industry_top_range():
    assert client.get("/api/industry?top=2").status_code == 422   # ge=5
    assert client.get("/api/industry?top=999").status_code == 422  # le=50


def test_chat_empty_messages_400():
    r = client.post("/api/chat", json={"messages": [], "llm": {"model": "x", "baseURL": "http://x", "apiKey": "k"}})
    assert r.status_code == 400


def test_chat_api_missing_key_400():
    # API 接入缺 baseURL/apiKey → 400（在开流前拦下）
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "hi"}],
        "llm": {"provider": "deepseek", "model": "deepseek-chat", "baseURL": "", "apiKey": ""},
    })
    assert r.status_code == 400


def test_chat_cli_not_installed_400():
    # 订阅接入选一个本机没装的 CLI → 400 明确提示（不静默失败）
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "hi"}],
        "llm": {"provider": "cli-qwen", "model": "qwen-code", "baseURL": "", "apiKey": ""},
    })
    # qwen 一般未装 → 400；若恰好装了 qwen 则会进流式（放宽断言）
    assert r.status_code in (400, 200)


@pytest.fixture()
def radar_cache(tmp_path, monkeypatch):
    """隔离资讯雷达缓存，避免测试读取或写入用户的 radar.json。"""
    cache_file = tmp_path / "radar.json"
    monkeypatch.setattr(newsradar, "CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(newsradar, "CACHE_FILE", str(cache_file))
    data = {
        "generated_at": "2026-08-09 10:00",
        "snapshot_id": "snapshot-current",
        "recent_days": 7,
        "industries": [{
            "key": "ai", "name": "AI", "accent": "#f60", "total": 1,
            "items": [{"title": "English headline", "url": "https://example.test", "time": "08-09 10:00", "source": "Test"}],
        }],
        "stats": {"industries": 1, "total_sources": 1, "failed_sources": 0},
    }
    with newsradar._CACHE_LOCK:
        newsradar._write_cache(data)
    return data


def test_radar_enrichment_persists_digest_and_translations(radar_cache):
    r = client.post("/api/radar/enrichment", json={
        "industry_key": "ai",
        "snapshot_id": radar_cache["snapshot_id"],
        "digest": "- AI 要点",
        "translations": [{"index": 0, "zh": "英文标题"}],
    })
    assert r.status_code == 200
    industry = r.json()["data"]["industries"][0]
    assert industry["digest"] == "- AI 要点"
    assert industry["items"][0]["title"] == "English headline"
    assert industry["items"][0]["zh"] == "英文标题"
    assert newsradar.load_cache()["industries"][0]["digest"] == "- AI 要点"


def test_radar_enrichment_rejects_stale_snapshot(radar_cache):
    r = client.post("/api/radar/enrichment", json={
        "industry_key": "ai",
        "snapshot_id": "snapshot-stale",
        "digest": "- 过期要点",
        "translations": [],
    })
    assert r.status_code == 409
    assert "digest" not in newsradar.load_cache()["industries"][0]


def test_radar_dedupes_items_by_normalized_title():
    items = [
        {"title": "Building robots that survive the warehouse", "source": "The Robot Report"},
        {"title": "  building  robots that survive the warehouse ", "source": "Robotics Business Review"},
        {"title": "另一条新闻", "source": "Test"},
    ]
    deduped = newsradar._dedupe_items_by_title(items)
    assert [item["source"] for item in deduped] == ["The Robot Report", "Test"]


def test_global_stock_404(monkeypatch):
    """无法解析的美股/港股代码 → 404（不 500、不崩）。"""
    import gstock
    monkeypatch.setattr(gstock, "us_hk_stock", lambda q: {})
    assert client.get("/api/global/stock?symbol=ZZZZ.US").status_code == 404


@pytest.mark.parametrize(("raw", "expected"), [
    ("aapl.us", ("US", "AAPL")),
    ("700.hk", ("HK", "00700")),
    ("005930.kr", ("KR", "005930")),
])
def test_gstock_parses_country_suffix(raw, expected):
    import gstock
    assert gstock._parse_symbol(raw) == expected


@pytest.mark.parametrize("raw", ["AAPL", "00700", "005930.KS", "300760", "AAPL.HK"])
def test_gstock_rejects_unsupported_symbol_format(raw):
    import gstock
    with pytest.raises(gstock.SymbolInputError):
        gstock._parse_symbol(raw)


def test_gstock_us_probes_only_us_markets_and_stops_on_match(monkeypatch):
    import gstock
    calls = []

    def fake_quote(secid, _fields):
        calls.append(secid)
        return {"f57": "IBM", "f58": "IBM", "f59": 2} if secid == "106.IBM" else None

    monkeypatch.setattr(gstock, "_push2_stock_get", fake_quote)
    monkeypatch.setattr(gstock, "_key_metrics", lambda _code: None)
    stock = gstock.us_hk_stock("IBM.US")
    assert calls == ["105.IBM", "106.IBM"]
    assert stock["market"] == "NYSE"


@pytest.mark.parametrize(("raw", "expected_secid", "market"), [
    ("700.HK", "116.00700", "HK"),
    ("005930.KR", "177.005930", "KR"),
])
def test_gstock_hk_kr_use_one_fixed_market(monkeypatch, raw, expected_secid, market):
    import gstock
    calls = []

    def fake_quote(secid, _fields):
        calls.append(secid)
        return {"f57": secid.split(".", 1)[1], "f58": "Test", "f59": 2}

    monkeypatch.setattr(gstock, "_push2_stock_get", fake_quote)
    monkeypatch.setattr(gstock, "_key_metrics", lambda _code: None)
    stock = gstock.us_hk_stock(raw)
    assert calls == [expected_secid]
    assert stock["market"] == market


def test_global_stock_invalid_format_returns_400():
    assert client.get("/api/global/stock?symbol=AAPL").status_code == 400


def test_ttl_cache_hits_then_expires_and_does_not_cache_errors(stock_cache, monkeypatch):
    calls = []

    def fetch():
        calls.append("fetch")
        return len(calls)

    assert app_module._cached("test", "A", 60, fetch) == 1
    assert app_module._cached("test", "A", 60, fetch) == 1
    assert calls == ["fetch"]

    with app_module._STOCK_CACHE_LOCK:
        app_module._STOCK_CACHE[("test", "A")] = (0, 1)
    monkeypatch.setattr(app_module.time, "monotonic", lambda: 61)
    assert app_module._cached("test", "A", 60, fetch) == 2

    def fail():
        raise RuntimeError("source unavailable")

    with pytest.raises(RuntimeError):
        app_module._cached("test", "error", 60, fail)
    assert ("test", "error") not in app_module._STOCK_CACHE


def test_ttl_cache_evicts_least_recently_used_entry(stock_cache):
    for i in range(app_module._STOCK_CACHE_MAX_ENTRIES):
        app_module._cached("capacity", i, 60, lambda i=i: i)
    app_module._cached("capacity", 0, 60, lambda: 0)  # 0 becomes most recently used
    app_module._cached("capacity", "new", 60, lambda: "new")
    assert len(app_module._STOCK_CACHE) == app_module._STOCK_CACHE_MAX_ENTRIES
    assert ("capacity", 0) in app_module._STOCK_CACHE
    assert ("capacity", 1) not in app_module._STOCK_CACHE


def test_stock_routes_cache_code_and_parameter_variants(stock_cache, monkeypatch):
    calls = {"valuation": 0, "reports": [], "news": []}

    def valuation(code):
        calls["valuation"] += 1
        return {"code": code}

    def reports(code, max_pages):
        calls["reports"].append((code, max_pages))
        return []

    def news(code, limit):
        calls["news"].append((code, limit))
        return []

    monkeypatch.setattr(app_module.astock, "full_valuation", valuation)
    monkeypatch.setattr(app_module.astock, "eastmoney_reports", reports)
    monkeypatch.setattr(app_module.astock, "stock_news", news)

    assert client.get("/api/valuation?code=300760").status_code == 200
    assert client.get("/api/valuation?code=300760").status_code == 200
    assert calls["valuation"] == 1

    client.get("/api/reports?code=300760&pages=2")
    client.get("/api/reports?code=300760&pages=2")
    client.get("/api/reports?code=300760&pages=3")
    assert calls["reports"] == [("300760", 2), ("300760", 3)]

    client.get("/api/news?code=300760&limit=20")
    client.get("/api/news?code=300760&limit=20")
    client.get("/api/news?code=300760&limit=10")
    assert calls["news"] == [("300760", 20), ("300760", 10)]


def test_global_stock_and_hk_cashflow_use_ttl_cache(stock_cache, monkeypatch):
    calls = {"stock": 0, "cashflow": 0}

    def stock(symbol):
        calls["stock"] += 1
        return {"code": "AAPL", "name": "Apple", "market": "NASDAQ", "quote": {}, "metrics": None}

    def cashflow(symbol):
        calls["cashflow"] += 1
        return {"code": "00700", "name": "Tencent", "market": "HK", "periods": []}

    monkeypatch.setattr(app_module.gstock, "us_hk_stock", stock)
    monkeypatch.setattr(app_module.gstock, "hk_cashflow", cashflow)
    assert client.get("/api/global/stock?symbol=aapl.us").status_code == 200
    assert client.get("/api/global/stock?symbol=AAPL.US").status_code == 200
    assert calls["stock"] == 1
    assert client.get("/api/global/hk/cashflow?symbol=00700.hk").status_code == 200
    assert client.get("/api/global/hk/cashflow?symbol=00700.HK").status_code == 200
    assert calls["cashflow"] == 1


def test_gstock_quote_full_null_shape():
    """行情取不到时 `_quote_from({})` 仍返回完整 null 形状（契合 GlobalQuote 类型），不是空 dict。"""
    import gstock
    q = gstock._quote_from({})
    assert set(q) == {"code", "name", "price", "open", "high", "low", "prev_close", "amount", "mcap", "change_pct"}
    assert all(v is None for v in q.values())
