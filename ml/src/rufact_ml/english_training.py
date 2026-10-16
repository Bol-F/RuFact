"""Leakage-audited, text-only English LIAR research baseline."""

from __future__ import annotations

import argparse
import csv
import io
import json
import zipfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import FeatureUnion, Pipeline

from rufact_ml.model import MAX_TEXT_LENGTH, normalize_for_model
from rufact_ml.training import (
    ML_ROOT,
    DatasetFile,
    _classification_metrics,
    _log_odds,
    _stratified_bootstrap_intervals,
    ensure_dataset_file,
    sha256_file,
)

SEED = 20261012
MODEL_VERSION = "tfidf-word-char-logreg-en-v2"
MODEL_NAME = "RuFact English LIAR Word + Character TF-IDF Logistic Regression"
ARTIFACT_DIR = ML_ROOT / "artifacts" / "en"
LABEL_MAPPING = {"true": 0, "mostly-true": 0, "false": 1, "barely-true": 1, "pants-fire": 1}
DATASET_FILE = DatasetFile(
    filename="liar-v1.zip",
    sha256="611c1addad919743dde15822b87a60bfb760d8f85597f25289e34621800654c7",
    url="https://sites.cs.ucsb.edu/~william/data/liar_dataset.zip",
)
MEMBER_HASHES = {
    "train.tsv": "23ef8cb7ff57b25c941100d0744039cebc595d65a67ea190f72b330a658d8c36",
    "valid.tsv": "8dd3d7ed1a11e78ed7df090c9eddb0f91147f895850c78d49dd7b4e88fd09a16",
    "test.tsv": "ee41e2c741e0019216952625145af8c4aa8c8d3057ec68284b134267bb845e6f",
}


def parse_split(content: str) -> tuple[list[tuple[str, int]], dict[str, Any]]:
    """Use only statement text: no speaker identity/history, party, subject or context."""
    # The release is literal tab-separated text, not RFC CSV. Quotes inside claims
    # are ordinary characters and must not merge records or consume tab fields.
    rows = list(csv.reader(io.StringIO(content), delimiter="\t", quoting=csv.QUOTE_NONE))
    samples: list[tuple[str, int]] = []
    counts: Counter[str] = Counter()
    for row in rows:
        if len(row) != 14 or row[1] not in {*LABEL_MAPPING, "half-true"}:
            raise ValueError("LIAR TSV has an unexpected schema or label.")
        counts[row[1]] += 1
        if row[1] == "half-true":
            continue
        text = normalize_for_model(row[2])
        if not text:
            raise ValueError("LIAR contains an empty statement.")
        samples.append((text, LABEL_MAPPING[row[1]]))
    return samples, {
        "rawSamples": len(rows),
        "originalLabelCounts": dict(sorted(counts.items())),
        "halfTrueExcluded": counts["half-true"],
        "binarySamplesBeforeDeduplication": len(samples),
    }


def clean_splits(
    splits: dict[str, list[tuple[str, int]]],
) -> tuple[dict[str, tuple[np.ndarray, np.ndarray]], dict[str, dict[str, int]]]:
    """Preserve test priority; held-out normalized text never enters lower-priority data."""
    cleaned: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    audits: dict[str, dict[str, int]] = {}
    held_out: set[str] = set()
    for name in ("test", "valid", "train"):
        rows = splits[name]
        labels_by_key: dict[str, set[int]] = {}
        for text, label in rows:
            labels_by_key.setdefault(text.casefold(), set()).add(label)
        conflicts = {key for key, labels in labels_by_key.items() if len(labels) > 1}
        texts: list[str] = []
        labels: list[int] = []
        seen: set[str] = set()
        removed_overlap = removed_duplicate = removed_conflict = 0
        for text, label in rows:
            key = text.casefold()
            if key in held_out:
                removed_overlap += 1
            elif key in conflicts:
                removed_conflict += 1
            elif key in seen:
                removed_duplicate += 1
            else:
                seen.add(key)
                texts.append(text)
                labels.append(label)
        # Even removed/conflicting held-out statements are excluded from training.
        held_out.update(labels_by_key)
        cleaned[name] = (np.asarray(texts, dtype=object), np.asarray(labels))
        counts = Counter(labels)
        audits[name] = {
            "samples": len(texts),
            "real": counts[0],
            "fake": counts[1],
            "heldOutOverlapRemoved": removed_overlap,
            "withinSplitDuplicatesRemoved": removed_duplicate,
            "conflictingLabelRowsRemoved": removed_conflict,
        }
    return cleaned, audits


def load_dataset(path: Path):
    import hashlib

    splits: dict[str, list[tuple[str, int]]] = {}
    summaries: dict[str, Any] = {}
    with zipfile.ZipFile(path) as archive:
        for name in ("train", "valid", "test"):
            filename = f"{name}.tsv"
            content = archive.read(filename)
            if hashlib.sha256(content).hexdigest() != MEMBER_HASHES[filename]:
                raise RuntimeError(f"LIAR member checksum mismatch: {filename}")
            splits[name], summaries[name] = parse_split(content.decode("utf-8"))
    cleaned, audits = clean_splits(splits)
    for name, audit in audits.items():
        summaries[name].update(audit)
    return cleaned, summaries


def build_model(c_value: float) -> Pipeline:
    return Pipeline(
        [
            (
                "features",
                FeatureUnion(
                    [
                        (
                            "word",
                            TfidfVectorizer(
                                ngram_range=(1, 2),
                                min_df=2,
                                max_features=40_000,
                                sublinear_tf=True,
                            ),
                        ),
                        (
                            "char",
                            TfidfVectorizer(
                                analyzer="char_wb",
                                ngram_range=(3, 5),
                                min_df=2,
                                max_features=60_000,
                                sublinear_tf=True,
                            ),
                        ),
                    ],
                    transformer_weights={"word": 1.0, "char": 0.6},
                ),
            ),
            (
                "classifier",
                LogisticRegression(
                    C=c_value,
                    solver="liblinear",
                    class_weight="balanced",
                    max_iter=2000,
                    random_state=SEED,
                ),
            ),
        ]
    )


def fit_calibrated_candidate(
    train_texts: np.ndarray,
    train_labels: np.ndarray,
    c_value: float,
    *,
    folds: int = 5,
) -> tuple[Pipeline, LogisticRegression, dict[str, Any]]:
    """Fit calibration only on predictions of models that did not see each claim.

    The feature union is inside each CV pipeline, so neither vocabulary nor IDF
    statistics see the held-out fold. Validation is reserved for selection and
    test data is not accepted by this function.
    """
    splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)
    out_of_fold = cross_val_predict(
        build_model(c_value),
        train_texts,
        train_labels,
        cv=splitter,
        method="predict_proba",
        n_jobs=1,
    )[:, 1]
    calibrator = LogisticRegression(C=1.0, solver="liblinear", random_state=SEED)
    calibrator.fit(_log_odds(out_of_fold), train_labels)
    model = build_model(c_value)
    model.fit(train_texts, train_labels)
    return model, calibrator, {
        "samples": len(train_labels),
        "folds": folds,
        "method": "sigmoid on training-only stratified out-of-fold predictions; "
        "C=1; no class reweighting; every fold refits vocabulary and IDF",
        "outOfFoldUncalibratedMetrics": _classification_metrics(train_labels, out_of_fold),
    }


def train(force_download: bool = False) -> dict[str, Any]:
    dataset_path = ensure_dataset_file(DATASET_FILE, force=force_download)
    splits, summaries = load_dataset(dataset_path)
    train_texts, train_labels = splits["train"]
    valid_texts, valid_labels = splits["valid"]
    test_texts, test_labels = splits["test"]
    candidates: dict[str, Any] = {}
    selected_model = None
    selected_calibrator = None
    selected_calibration = None
    selected_c = 0.0
    best_f1 = -1.0
    for c_value in (0.25, 1.0, 4.0):
        print(f"Fitting English candidate C={c_value} on {len(train_labels)} claims...", flush=True)
        model, calibrator, calibration = fit_calibrated_candidate(
            train_texts, train_labels, c_value
        )
        raw_validation = model.predict_proba(valid_texts)[:, 1]
        probabilities = calibrator.predict_proba(_log_odds(raw_validation))[:, 1]
        candidate_metrics = _classification_metrics(valid_labels, probabilities)
        candidates[str(c_value)] = candidate_metrics
        if candidate_metrics["macroF1"] > best_f1:
            best_f1 = candidate_metrics["macroF1"]
            selected_c = c_value
            selected_model = model
            selected_calibrator = calibrator
            selected_calibration = calibration
    assert selected_model is not None
    assert selected_calibrator is not None
    assert selected_calibration is not None
    # The test split is used only here, after all model selection and calibration.
    raw_test = selected_model.predict_proba(test_texts)[:, 1]
    calibrated_test = selected_calibrator.predict_proba(_log_odds(raw_test))[:, 1]
    print("Evaluating the held-out English benchmark after freezing selection...", flush=True)
    majority_label = int(np.bincount(train_labels).argmax())
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    limitations = [
        "LIAR v1 is research-use-only; original sources retain copyright. "
        "Not commercially cleared.",
        "Mostly US political claims from 2007–2016; not representative of all English/UK news.",
        "Text-only statistical model: no retrieval, evidence, speaker metadata or truth guarantee.",
        "Half-true claims are excluded, so binary metrics do not cover "
        "ambiguous/partly true claims.",
        "Exact duplicates are removed, but paraphrases and shared speakers/topics may remain.",
        "Official random splits are not speaker-disjoint or time-separated.",
        "Calibration and confidence can drift on current claims, other domains and languages.",
        "This public test benchmark was already evaluated for v1; the v2 test result is a "
        "repeated benchmark, not a newly collected blind evaluation.",
    ]
    metrics = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "language": "en",
        "modelVersion": MODEL_VERSION,
        "modelName": MODEL_NAME,
        "maxTextLength": MAX_TEXT_LENGTH,
        "seed": SEED,
        "dataset": {
            "name": "LIAR v1.0 (English short claims)",
            "url": DATASET_FILE.url,
            "archiveSha256": DATASET_FILE.sha256,
            "memberSha256": MEMBER_HASHES,
            "license": "Research purposes only; original sources retain copyright",
            "labelMapping": {
                "REAL": ["true", "mostly-true"],
                "FAKE": ["false", "barely-true", "pants-fire"],
                "excluded": ["half-true"],
            },
            "splits": summaries,
            "deduplication": "NFKC + whitespace normalization + 5000-char truncation + casefold; "
            "test > validation > train priority; conflicting labels excluded",
            "featuresUsed": ["statement"],
            "featuresExcluded": ["id", "speaker", "history counts", "party", "subject", "context"],
        },
        "evaluation": {
            "headline": "heldOutTest",
            "modelSelection": {
                "samples": len(valid_labels),
                "selectedC": selected_c,
                "criterion": "calibrated macroF1 on all validation claims; fixed threshold 0.5; "
                "tie prefers lower C",
                "candidates": candidates,
            },
            "calibration": selected_calibration,
            "heldOutTest": {
                "protocol": "Official test split after deduplication; never used for fitting, "
                "selection, calibration or threshold tuning. Statement text only.",
                "previouslyEvaluatedBenchmark": True,
                "samples": int(len(test_labels)),
                "metrics": _classification_metrics(test_labels, calibrated_test),
                "uncalibratedMetrics": _classification_metrics(test_labels, raw_test),
                "confidenceIntervals": _stratified_bootstrap_intervals(
                    test_labels,
                    calibrated_test,
                    iterations=2000,
                ),
                "majorityBaseline": {
                    "selectedOn": "training class frequencies",
                    "label": majority_label,
                    "accuracy": round(float(np.mean(test_labels == majority_label)), 6),
                },
            },
        },
        "limitations": limitations,
    }
    artifact = {
        "schema_version": 1,
        "language": "en",
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "trained_at": generated_at,
        "base_model": selected_model,
        "calibrator": selected_calibrator,
        "metrics": metrics,
        "sklearn_version": sklearn.__version__,
        "dataset_revision": DATASET_FILE.sha256,
    }
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = ARTIFACT_DIR / "model.joblib"
    temporary = artifact_path.with_suffix(".joblib.tmp")
    joblib.dump(artifact, temporary, compress=3)
    temporary.replace(artifact_path)
    (ARTIFACT_DIR / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (ARTIFACT_DIR / "artifact-manifest.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "filename": "model.joblib",
                "language": "en",
                "modelVersion": MODEL_VERSION,
                "sha256": sha256_file(artifact_path),
                "bytes": artifact_path.stat().st_size,
                "sklearnVersion": sklearn.__version__,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force-download", action="store_true")
    args = parser.parse_args()
    metrics = train(force_download=args.force_download)
    test = metrics["evaluation"]["heldOutTest"]
    print(
        f"English held-out metrics ({test['samples']} claims): "
        f"accuracy={test['metrics']['accuracy']:.3f}, "
        f"macro_f1={test['metrics']['macroF1']:.3f}",
        flush=True,
    )


if __name__ == "__main__":
    main()
