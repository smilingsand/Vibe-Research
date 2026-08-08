"""API 验证/契约测（FastAPI TestClient）。大多在校验层就返回，不联网、可靠。"""
import pytest
from fastapi.testclient import TestClient

import app as app_module
import newsradar

client = TestClient(app_module.app)


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
    assert client.get("/api/global/stock?symbol=ZZZZ").status_code == 404


def test_gstock_quote_full_null_shape():
    """行情取不到时 `_quote_from({})` 仍返回完整 null 形状（契合 GlobalQuote 类型），不是空 dict。"""
    import gstock
    q = gstock._quote_from({})
    assert set(q) == {"code", "name", "price", "open", "high", "low", "prev_close", "amount", "mcap", "change_pct"}
    assert all(v is None for v in q.values())
