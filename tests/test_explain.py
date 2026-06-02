"""Unit tests for the "Explain this number" service (feature #218).

These tests are deliberately scoped to the pure helpers in
``redash.explain`` so they run without the Flask app, the database, or a
real Anthropic key. The integration is covered separately via the
``/api/explain`` handler tests.
"""
import pytest
from mock import MagicMock, patch

from redash import explain as explain_svc


class TestNormalisePayload:
    def test_requires_metric_label(self):
        with pytest.raises(ValueError):
            explain_svc.normalise_payload({"metric_value": 10})

    def test_requires_metric_value(self):
        with pytest.raises(ValueError):
            explain_svc.normalise_payload({"metric_label": "Revenue"})

    def test_rejects_non_object(self):
        with pytest.raises(ValueError):
            explain_svc.normalise_payload("nope")  # type: ignore[arg-type]

    def test_coerces_numbers(self):
        out = explain_svc.normalise_payload(
            {"metric_label": "Revenue", "metric_value": "1234"}
        )
        assert out["metric_value"] == 1234.0

    def test_rejects_non_numeric_metric_value(self):
        with pytest.raises(ValueError):
            explain_svc.normalise_payload(
                {"metric_label": "Revenue", "metric_value": "abc"}
            )

    def test_drops_unknown_keys(self):
        out = explain_svc.normalise_payload(
            {"metric_label": "Revenue", "metric_value": 1, "ssn": "leak-me"}
        )
        assert "ssn" not in out

    def test_caps_top_contributors_at_ten(self):
        contribs = [{"dimension": "x", "value": i} for i in range(20)]
        out = explain_svc.normalise_payload(
            {"metric_label": "M", "metric_value": 1, "top_contributors": contribs}
        )
        assert len(out["top_contributors"]) == 10

    def test_truncates_long_labels(self):
        out = explain_svc.normalise_payload(
            {"metric_label": "x" * 500, "metric_value": 1}
        )
        assert len(out["metric_label"]) == 200

    def test_passes_through_query_id(self):
        out = explain_svc.normalise_payload(
            {"metric_label": "m", "metric_value": 1, "query_id": 42}
        )
        assert out["query_id"] == 42


class TestCacheKey:
    def test_deterministic(self):
        a = explain_svc.cache_key({"metric_label": "m", "metric_value": 1.0})
        b = explain_svc.cache_key({"metric_value": 1.0, "metric_label": "m"})
        assert a == b

    def test_differs_per_payload(self):
        a = explain_svc.cache_key({"metric_label": "m", "metric_value": 1.0})
        b = explain_svc.cache_key({"metric_label": "m", "metric_value": 2.0})
        assert a != b

    def test_prefixed(self):
        k = explain_svc.cache_key({"metric_label": "m", "metric_value": 1.0})
        assert k.startswith("explain:cache:")


class TestBuildUserPrompt:
    def test_includes_required_fields(self):
        prompt = explain_svc.build_user_prompt(
            explain_svc.normalise_payload(
                {"metric_label": "Revenue", "metric_value": 1_234_567}
            )
        )
        assert "Revenue" in prompt
        assert "1,234,567" in prompt

    def test_includes_delta_pct_as_percent(self):
        prompt = explain_svc.build_user_prompt(
            explain_svc.normalise_payload({
                "metric_label": "M",
                "metric_value": 110,
                "comparison_label": "vs prior",
                "comparison_value": 100,
                "delta_abs": 10,
                "delta_pct": 0.10,
            })
        )
        assert "+10.00%" in prompt
        assert "vs prior" in prompt

    def test_renders_top_contributors(self):
        prompt = explain_svc.build_user_prompt(
            explain_svc.normalise_payload({
                "metric_label": "M",
                "metric_value": 100,
                "top_contributors": [
                    {"dimension": "branch", "label": "JHB", "value": 60, "share_pct": 0.6}
                ],
            })
        )
        assert "JHB" in prompt
        assert "60.0% of total" in prompt

    def test_no_comparison_when_absent(self):
        prompt = explain_svc.build_user_prompt(
            explain_svc.normalise_payload({"metric_label": "M", "metric_value": 1})
        )
        assert "Delta" not in prompt


class TestExtractText:
    def test_concatenates_text_blocks(self):
        out = explain_svc.extract_text({
            "content": [
                {"type": "text", "text": "Hello, "},
                {"type": "text", "text": "world."},
            ]
        })
        assert out == "Hello, \nworld."

    def test_ignores_non_text_blocks(self):
        out = explain_svc.extract_text({
            "content": [
                {"type": "tool_use", "input": {}},
                {"type": "text", "text": "ok"},
            ]
        })
        assert out == "ok"

    def test_raises_on_empty(self):
        with pytest.raises(ValueError):
            explain_svc.extract_text({"content": []})

    def test_raises_on_bad_shape(self):
        with pytest.raises(ValueError):
            explain_svc.extract_text({"content": "not a list"})


class TestCallAnthropic:
    def test_uses_system_prompt_and_model(self):
        fake = MagicMock()
        fake.json.return_value = {"content": [{"type": "text", "text": "ok"}]}
        fake.raise_for_status.return_value = None

        with patch.object(explain_svc, "settings") as fs, \
             patch.object(explain_svc.requests, "post", return_value=fake) as post:
            fs.ANTHROPIC_API_KEY = "sk-test"
            fs.EXPLAIN_MODEL = "claude-sonnet-4-5-20250929"
            fs.EXPLAIN_MAX_TOKENS = 400
            fs.EXPLAIN_TIMEOUT_SECONDS = 20
            fs.EXPLAIN_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
            fs.EXPLAIN_ANTHROPIC_VERSION = "2023-06-01"

            text = explain_svc.call_anthropic({
                "metric_label": "Revenue", "metric_value": 100
            })

        assert text == "ok"
        post.assert_called_once()
        kwargs = post.call_args.kwargs
        sent_body = kwargs["json"]
        assert sent_body["model"] == "claude-sonnet-4-5-20250929"
        assert sent_body["max_tokens"] == 400
        assert sent_body["system"] == explain_svc.SYSTEM_PROMPT
        # The user message must be a list-of-content shape so future tool-use
        # additions don't change the contract.
        assert sent_body["messages"][0]["role"] == "user"
        assert isinstance(sent_body["messages"][0]["content"], list)
        # The auth header must be x-api-key, not Authorization.
        assert kwargs["headers"]["x-api-key"] == "sk-test"

    def test_raises_when_no_key(self):
        with patch.object(explain_svc, "settings") as fs:
            fs.ANTHROPIC_API_KEY = ""
            with pytest.raises(ValueError):
                explain_svc.call_anthropic({
                    "metric_label": "Revenue", "metric_value": 100
                })


class TestRateLimit:
    def test_allows_when_disabled(self):
        allowed, count = explain_svc.check_rate_limit(1, 0)
        assert allowed is True
        assert count == 0

    def test_allows_until_limit_then_blocks(self):
        fake_redis = MagicMock()
        # Simulate a fresh bucket — INCR returns 1, 2, 3 in sequence.
        fake_redis.incr.side_effect = [1, 2, 3, 4]
        with patch.object(explain_svc, "redis_connection", fake_redis):
            assert explain_svc.check_rate_limit(7, 3) == (True, 1)
            assert explain_svc.check_rate_limit(7, 3) == (True, 2)
            assert explain_svc.check_rate_limit(7, 3) == (True, 3)
            assert explain_svc.check_rate_limit(7, 3) == (False, 4)
        # EXPIRE should be set the first time only.
        assert fake_redis.expire.call_count == 1

    def test_fails_open_on_redis_error(self):
        fake_redis = MagicMock()
        fake_redis.incr.side_effect = RuntimeError("redis down")
        with patch.object(explain_svc, "redis_connection", fake_redis):
            allowed, count = explain_svc.check_rate_limit(7, 60)
        assert allowed is True
        assert count == 0


class TestCache:
    def test_get_returns_string(self):
        fake = MagicMock()
        fake.get.return_value = "cached text"
        with patch.object(explain_svc, "redis_connection", fake):
            out = explain_svc.get_cached(
                {"metric_label": "M", "metric_value": 1}
            )
        assert out == "cached text"

    def test_get_returns_none_for_miss(self):
        fake = MagicMock()
        fake.get.return_value = None
        with patch.object(explain_svc, "redis_connection", fake):
            out = explain_svc.get_cached(
                {"metric_label": "M", "metric_value": 1}
            )
        assert out is None

    def test_get_decodes_bytes(self):
        fake = MagicMock()
        fake.get.return_value = b"binary"
        with patch.object(explain_svc, "redis_connection", fake):
            out = explain_svc.get_cached(
                {"metric_label": "M", "metric_value": 1}
            )
        assert out == "binary"

    def test_store_skipped_when_ttl_nonpositive(self):
        fake = MagicMock()
        with patch.object(explain_svc, "redis_connection", fake):
            explain_svc.store_cached({"metric_label": "M", "metric_value": 1}, "x", 0)
        fake.set.assert_not_called()

    def test_store_writes_with_ttl(self):
        fake = MagicMock()
        with patch.object(explain_svc, "redis_connection", fake):
            explain_svc.store_cached(
                {"metric_label": "M", "metric_value": 1}, "explanation", 600
            )
        fake.set.assert_called_once()
        kwargs = fake.set.call_args.kwargs
        assert kwargs["ex"] == 600
