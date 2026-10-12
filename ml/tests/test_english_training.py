import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from rufact_ml.english_training import clean_splits, parse_split
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
