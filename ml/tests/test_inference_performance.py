from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
import pytest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from rufact_ml.model import ModelBundle, load_model_bundle


def _uncached_word_features(
    bundle: ModelBundle, text: str
) -> tuple[Any, np.ndarray, np.ndarray]:
    """Reference implementation before caching; preserve prediction semantics."""
    steps = bundle.base_model.named_steps
    classifier = steps["classifier"]
    if "tfidf" in steps:
        vectorizer = steps["tfidf"]
        return (
            vectorizer.transform([text]),
            vectorizer.get_feature_names_out(),
            classifier.coef_[0],
        )
    features = steps["features"]
    vectorizer = dict(features.transformer_list)["word"]
    names = vectorizer.get_feature_names_out()
    weight = float((features.transformer_weights or {}).get("word", 1.0))
    return vectorizer.transform([text]), names, classifier.coef_[0][: len(names)] * weight


@pytest.fixture(scope="module", params=["ru", "en"])
def bundle(request: pytest.FixtureRequest) -> ModelBundle:
    return load_model_bundle(language=request.param)


def test_cached_metadata_preserves_exact_prediction_outputs(
    bundle: ModelBundle, monkeypatch: pytest.MonkeyPatch
) -> None:
    texts = (
        "Trump has six wives",
        "The report cites reliable sources about public health and medical research.",
        "Учёные подтвердили, что этот метод гарантированно помогает каждому.",
        "По данным официального отчёта опубликованы результаты исследования.",
        ("This report describes health information and sources. " * 100)[:5000],
    )
    expected = [bundle.predict(text).model_dump() for text in texts]
    with monkeypatch.context() as context:
        context.setattr(ModelBundle, "_word_explanation_features", _uncached_word_features)
        uncached = [bundle.predict(text).model_dump() for text in texts]
    assert expected == uncached


def test_metadata_is_built_once_not_per_prediction(
    bundle: ModelBundle, monkeypatch: pytest.MonkeyPatch
) -> None:
    vectorizer = bundle._word_vectorizer
    original: Callable[[], np.ndarray] = vectorizer.get_feature_names_out
    calls = 0

    def tracked_names() -> np.ndarray:
        nonlocal calls
        calls += 1
        return original()

    monkeypatch.setattr(vectorizer, "get_feature_names_out", tracked_names)
    cached_bundle = ModelBundle(artifact=bundle.artifact)
    assert calls == 1
    names = cached_bundle._word_feature_names
    coefficients = cached_bundle._word_coefficients
    for text in ("This claim cites a source.", "Проверяем текст по источникам.", "Short text"):
        cached_bundle.predict(text)
    assert calls == 1
    assert cached_bundle._word_feature_names is names
    assert cached_bundle._word_coefficients is coefficients


def test_metadata_is_read_only_and_owns_its_coefficient_storage(bundle: ModelBundle) -> None:
    classifier_coefficients = bundle.base_model.named_steps["classifier"].coef_
    assert not bundle._word_feature_names.flags.writeable
    assert not bundle._word_coefficients.flags.writeable
    assert not np.shares_memory(bundle._word_coefficients, classifier_coefficients)
    assert classifier_coefficients.flags.writeable
    with pytest.raises(ValueError):
        bundle._word_feature_names[0] = "changed"
    with pytest.raises(ValueError):
        bundle._word_coefficients[0] = 0


def test_cached_metadata_is_safe_for_existing_bounded_threaded_predictions(
    bundle: ModelBundle,
) -> None:
    texts = [
        "This report cites reliable sources.",
        "Это сообщение содержит ссылку на источник.",
    ] * 2
    expected = [bundle.predict(text).model_dump() for text in texts]
    with ThreadPoolExecutor(max_workers=2) as executor:
        actual = list(executor.map(bundle.predict, texts))
    assert [result.model_dump() for result in actual] == expected
    assert not bundle._word_feature_names.flags.writeable
    assert not bundle._word_coefficients.flags.writeable


def test_legacy_tfidf_pipeline_keeps_explanation_metadata_semantics() -> None:
    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer()),
            ("classifier", LogisticRegression(solver="liblinear")),
        ]
    ).fit(["reliable source report", "false claim rumour"], [0, 1])
    bundle = ModelBundle(artifact={"base_model": pipeline})
    vector, names, coefficients = bundle._word_explanation_features("reliable report")
    original_vector, original_names, original_coefficients = _uncached_word_features(
        bundle, "reliable report"
    )
    np.testing.assert_array_equal(vector.toarray(), original_vector.toarray())
    np.testing.assert_array_equal(names, original_names)
    np.testing.assert_array_equal(coefficients, original_coefficients)
    assert not names.flags.writeable
    assert not coefficients.flags.writeable
