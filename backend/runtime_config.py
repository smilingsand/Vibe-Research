"""Load user-editable backend runtime configuration once at process startup."""

from __future__ import annotations

import json
from pathlib import Path


CONFIG_FILE = Path(__file__).with_name("backend_config.json")


class RuntimeConfigError(RuntimeError):
    """The user-editable runtime configuration is missing or malformed."""


_INDEX_FIELDS = ("key", "name", "secid", "region", "source")


def _string_list(value: object, field: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and item.strip() for item in value):
        raise RuntimeConfigError(f"{field} 必须是非空字符串数组")
    return tuple(item.strip() for item in value)


def _index_list(value: object, field: str, expected_source: str) -> tuple[dict[str, str], ...]:
    if not isinstance(value, list) or not value:
        raise RuntimeConfigError(f"{field} 必须是非空数组")
    indices: list[dict[str, str]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise RuntimeConfigError(f"{field}[{index}] 必须是对象")
        normalized = {name: str(item.get(name, "")).strip() for name in _INDEX_FIELDS}
        if not all(normalized.values()):
            raise RuntimeConfigError(f"{field}[{index}] 必须包含非空 " + "、".join(_INDEX_FIELDS))
        if normalized["source"] != expected_source:
            raise RuntimeConfigError(f"{field}[{index}].source 必须为 {expected_source}")
        indices.append(normalized)
    return tuple(indices)


def _load() -> tuple[tuple[dict[str, str], ...], tuple[dict[str, str], ...], tuple[tuple[str, tuple[str, ...]], ...]]:
    try:
        raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeConfigError(f"缺少配置文件：{CONFIG_FILE}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeConfigError(f"配置文件 JSON 格式错误（第 {exc.lineno} 行）：{CONFIG_FILE}") from exc

    if not isinstance(raw, dict):
        raise RuntimeConfigError("配置文件根节点必须是对象")
    a_share_indices = _index_list(raw.get("a_share_indices"), "a_share_indices", "tencent")
    global_indices = _index_list(raw.get("global_indices"), "global_indices", "eastmoney")

    industries_raw = raw.get("report_industry_keywords")
    if not isinstance(industries_raw, list) or not industries_raw:
        raise RuntimeConfigError("report_industry_keywords 必须是非空数组")
    industry_keywords: list[tuple[str, tuple[str, ...]]] = []
    for index, item in enumerate(industries_raw):
        if not isinstance(item, dict) or not isinstance(item.get("industry"), str) or not item["industry"].strip():
            raise RuntimeConfigError(f"report_industry_keywords[{index}].industry 必须是非空字符串")
        industry_keywords.append((item["industry"].strip(), _string_list(item.get("keywords"), f"report_industry_keywords[{index}].keywords")))

    return a_share_indices, global_indices, tuple(industry_keywords)


A_SHARE_INDICES, GLOBAL_INDICES, REPORT_INDUSTRY_KEYWORDS = _load()
