import asyncio
import base64
import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from rufact_ml.main import app

TEST_JWT_SECRET = "test-only-service-secret-with-at-least-32-bytes"


@pytest.fixture(autouse=True)
def service_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ML_API_JWT_SECRET", TEST_JWT_SECRET)


def _encode_json(value: dict[str, object]) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _authorized_request(payload: dict[str, str], secret: str = TEST_JWT_SECRET):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    now = int(time.time())
    request_id = str(uuid.uuid4())
    header = _encode_json({"alg": "HS256", "typ": "JWT"})
    claims = _encode_json(
        {
            "iss": "rufact-web",
            "aud": "rufact-ml",
            "sub": "/predict",
            "iat": now,
            "exp": now + 30,
            "jti": request_id,
            "bodySha256": hashlib.sha256(body).hexdigest(),
        }
    )
    unsigned = f"{header}.{claims}"
    signature = (
        base64.urlsafe_b64encode(
            hmac.new(secret.encode(), unsigned.encode(), hashlib.sha256).digest()
        )
        .rstrip(b"=")
        .decode()
    )
    return body, {
        "Authorization": f"Bearer {unsigned}.{signature}",
        "Content-Type": "application/json",
        "X-Request-ID": request_id,
    }


def _post_prediction(client: TestClient, text: str):
    body, headers = _authorized_request({"text": text})
    return client.post("/predict", content=body, headers=headers)


def test_health_and_prediction_contract() -> None:
    analyzed_text = (
        "Срочно перешлите всем: неизвестные эксперты доказали, что этот "
        "метод гарантированно помогает каждому без исключения."
    )
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["ready"] is True

        response = _post_prediction(client, analyzed_text)
        assert response.status_code == 200
        payload = response.json()
        assert payload["label"] in {"REAL", "FAKE"}
        assert 0.5 <= payload["confidence"] <= 1
        assert payload["meta"] == {
            "engine": "external-model",
            "engineVersion": "tfidf-word-char-logreg-ru-v2",
            "externalSourcesChecked": False,
            "language": "ru",
        }
        for evidence in payload["evidence"]:
            assert evidence["start"] < evidence["end"]
            assert analyzed_text[evidence["start"] : evidence["end"]] == evidence["quote"]


def test_prediction_validation() -> None:
    with TestClient(app) as client:
        assert _post_prediction(client, "   ").status_code == 422
        assert _post_prediction(client, "а" * 5001).status_code == 422


def test_prediction_requires_valid_body_bound_jwt() -> None:
    with TestClient(app) as client:
        assert client.post("/predict", json={"text": "Тест"}).status_code == 401

        body, headers = _authorized_request({"text": "Исходный текст"})
        tampered = json.dumps(
            {"text": "Изменённый текст"}, ensure_ascii=False, separators=(",", ":")
        ).encode()
        assert body != tampered
        assert client.post("/predict", content=tampered, headers=headers).status_code == 401


def test_prediction_rejects_replayed_jwt() -> None:
    with TestClient(app) as client:
        body, headers = _authorized_request({"text": "Проверяем повтор токена"})
        assert client.post("/predict", content=body, headers=headers).status_code == 200
        assert client.post("/predict", content=body, headers=headers).status_code == 401


def test_prediction_rejects_when_capacity_is_exhausted() -> None:
    with TestClient(app) as client:
        client.app.state.predict_semaphore = asyncio.Semaphore(0)
        client.app.state.prediction_queue_timeout_seconds = 0.01
        response = _post_prediction(client, "Проверяем перегрузку сервиса")
        assert response.status_code == 503
        assert response.headers["retry-after"] == "1"


def test_prediction_rejects_oversized_declared_body() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/predict",
            content=b"{}",
            headers={"Content-Length": "24001"},
        )
        assert response.status_code == 413


def test_model_info_exposes_measured_quality() -> None:
    with TestClient(app) as client:
        response = client.get("/model-info")
        assert response.status_code == 200
        payload = response.json()
        headline = payload["evaluation"]["externalNestedCrossValidation"]
        assert headline["samples"] == 157
        assert headline["metrics"]["accuracy"] == 0.808917
        assert headline["metrics"]["confusionMatrix"] == [[65, 11], [19, 62]]


def test_english_routing_and_quality() -> None:
    with TestClient(app) as client:
        response = _post_prediction(client, "Trump has six wives")
        assert response.status_code == 200
        payload = response.json()
        assert payload["meta"]["language"] == "en"
        assert payload["meta"]["engineVersion"] == "tfidf-word-char-logreg-en-v1"
        assert "English" in payload["explanation"]
        assert client.get("/health").json()["availableModels"].keys() == {"ru", "en"}
        info = client.get("/model-info?language=en")
        assert info.status_code == 200
        assert info.json()["language"] == "en"
        test_metrics = info.json()["evaluation"]["heldOutTest"]
        assert test_metrics["samples"] == 1016
        assert test_metrics["metrics"]["accuracy"] == 0.63878
        for evidence in payload["evidence"]:
            assert "Trump has six wives"[evidence["start"] : evidence["end"]] == evidence["quote"]


@pytest.mark.parametrize(
    "text",
    [
        "Bu xabar rost emas va uning manbasi yo‘q.",
        "Бу хабар рост эмас ва унинг манбаси йўқ.",
        "123456789",
        "中文测试",
    ],
)
def test_unsupported_text_never_falls_back_to_russian(text: str) -> None:
    with TestClient(app) as client:
        assert _post_prediction(client, text).status_code == 422


def test_explicit_language_mismatch_and_signed_body() -> None:
    with TestClient(app) as client:
        body, headers = _authorized_request({"text": "This is an English claim.", "language": "ru"})
        assert client.post("/predict", content=body, headers=headers).status_code == 422
        body, headers = _authorized_request({"text": "This is an English claim.", "language": "en"})
        assert client.post("/predict", content=body, headers=headers).status_code == 200
        body, headers = _authorized_request({"text": "This is an English claim.", "language": "uz"})
        assert client.post("/predict", content=body, headers=headers).status_code == 422
        assert client.get("/model-info?language=uz").status_code == 422
