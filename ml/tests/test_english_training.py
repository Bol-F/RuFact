import json
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pytest
from sklearn.pipeline import Pipeline

from rufact_ml.english_training import clean_splits, fit_calibrated_candidate, parse_split
from rufact_ml.model import detect_language, load_model_bundle


def _tsv(label: str, text: str) -> str:
    return "\t".join(["id", label, text, *([""] * 11)])


def test_tsv_quotes_are_literal_and_half_true_is_not_true() -> None:
    samples, summary = parse_split(
        _tsv("false", '"Quoted claim without closing quote')
        + "\n"
        + _tsv("true", "Another claim")
        + "\n"
        + _tsv("half-true", "Only half true")
    )
    assert len(samples) == 2
    assert samples[0] == ('"Quoted claim without closing quote', 1)
    assert summary["halfTrueExcluded"] == 1
    with pytest.raises(ValueError):
        parse_split(_tsv("invented-label", "Invalid row"))


def test_deduplication_protects_test_and_calibration_data() -> None:
    splits, audit = clean_splits(
        {
            "test": [("Held out", 0)],
            "valid": [("held OUT", 1), ("Calibration", 1)],
            "train": [
                ("held out", 1),
                ("calibration", 0),
                ("Unique", 0),
                ("UNIQUE", 0),
                ("Conflict", 1),
                ("CONFLICT", 0),
            ],
        }
    )
    assert splits["test"][0].tolist() == ["Held out"]
    assert splits["valid"][0].tolist() == ["Calibration"]
    assert splits["train"][0].tolist() == ["Unique"]
    assert audit["train"]["heldOutOverlapRemoved"] == 2
    assert audit["train"]["conflictingLabelRowsRemoved"] == 2


def test_calibration_uses_training_only_out_of_fold_predictions(monkeypatch) -> None:
    texts = np.asarray(
        [
            f"The official published research confirms the measured result number {index}"
            for index in range(6)
        ]
        + [
            f"The secret viral rumor claims a miraculous hidden cure number {index}"
            for index in range(6)
        ],
        dtype=object,
    )
    labels = np.asarray([0] * 6 + [1] * 6)
    fit_inputs = []
    original_fit = Pipeline.fit

    def record_fit(self, fold_texts, fold_labels, **params):
        fit_inputs.append(list(fold_texts))
        return original_fit(self, fold_texts, fold_labels, **params)

    monkeypatch.setattr(Pipeline, "fit", record_fit)
    model, calibrator, audit = fit_calibrated_candidate(texts, labels, 1.0, folds=3)

    assert audit["samples"] == 12
    assert audit["folds"] == 3
    assert "training-only" in audit["method"]
    assert [len(fold) for fold in fit_inputs] == [8, 8, 8, 12]
    assert Counter(text for fold in fit_inputs[:3] for text in fold) == {
        text: 2 for text in texts
    }
    assert fit_inputs[-1] == texts.tolist()
    assert "official" in model.named_steps["features"].transformer_list[0][1].vocabulary_
    assert calibrator.classes_.tolist() == [0, 1]
    probabilities = calibrator.predict_proba(np.zeros((2, 1)))
    assert np.isfinite(probabilities).all()
    assert np.allclose(probabilities.sum(axis=1), 1)


@pytest.mark.parametrize(
    ("text", "language"),
    [
        ("Trump has six wives", "en"),
        ("В Москве сообщили о новых результатах исследования.", "ru"),
        ("O‘zbekiston haqida bu xabar rost emas.", "uz"),
        ("Бу хабар рост эмас ва улар учун манба йўқ.", "uz"),
        ("2026", "unknown"),
    ],
)
def test_content_language_is_independent_of_interface(text: str, language: str) -> None:
    assert detect_language(text) == language


def test_english_artifact_manifest_language_and_checksum() -> None:
    source = Path(__file__).resolve().parents[1] / "artifacts" / "en"
    # Isolated owned directory; avoid relying on an existing pytest temp tree's permissions.
    with TemporaryDirectory(prefix="rufact-english-artifact-test-") as directory:
        artifact = Path(directory) / "model.joblib"
        artifact.write_bytes((source / "model.joblib").read_bytes())
        manifest = json.loads((source / "artifact-manifest.json").read_text())
        manifest_path = Path(directory) / "artifact-manifest.json"
        manifest_path.write_text(json.dumps(manifest))
        assert load_model_bundle(artifact, language="en").language == "en"
        with pytest.raises(RuntimeError, match="language"):
            load_model_bundle(artifact, language="ru")
        artifact.write_bytes(b"not a trusted joblib artifact")
        with pytest.raises(RuntimeError, match="checksum"):
            load_model_bundle(artifact, language="en")
