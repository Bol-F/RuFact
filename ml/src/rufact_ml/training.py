from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import urllib.request
import zipfile
from collections import Counter
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any

import joblib
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold, cross_val_predict
from sklearn.pipeline import FeatureUnion, Pipeline

from rufact_ml import MODEL_VERSION
from rufact_ml.model import MAX_TEXT_LENGTH, normalize_for_model

SEED = 20260929
DATASET_REVISION = "bd9bdd36d1171f0031cc448c808ebee6ecacd6d0"
MODEL_NAME = "RuFact Word + Character TF-IDF Logistic Regression (RU)"
CALIBRATION_CANDIDATES = (1.0, 10.0, 100.0)
TAIGA_ARCHIVE_SHA256 = "5a522a810548fd31a0e96f678da0195a036ed78efbed09dcf4bd28572736633d"
TAIGA_LENTA_SHA256 = "3db0f1ac1ff2dbfa30b41a511473d369278411a2aa5d6478ea49ef6347cb53c0"
TAIGA_EXPECTED_SAMPLES = 834

ML_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ML_ROOT / "data" / "raw"
ARTIFACT_DIR = ML_ROOT / "artifacts"


@dataclass(frozen=True, slots=True)
class DatasetFile:
    filename: str
    sha256: str
    url: str


MAIN_FILE = DatasetFile(
    filename="corpus_labelstudio_export.json",
    sha256="aa632a5e2f17389d0eba55823d8bc9b625e7572ac74101f99a67dcb5d24bad3f",
    url=(
        "https://raw.githubusercontent.com/Anargul-Aimuratovna/"
        f"news-veracity-corpus/{DATASET_REVISION}/data/corpus_labelstudio_export.json"
    ),
)
EXTERNAL_FILE = DatasetFile(
    filename="external_validation_set.json",
    sha256="38ef928eaab90188013f9cc2ec9432f5d28b680491885a40837aa666f000b2b0",
    url=(
        "https://raw.githubusercontent.com/Anargul-Aimuratovna/"
        f"news-veracity-corpus/{DATASET_REVISION}/data/external_validation_set.json"
    ),
)
TAIGA_FILE = DatasetFile(
    filename="taiga_fake_news.rar",
    sha256=TAIGA_ARCHIVE_SHA256,
    url="https://linghub.ru/static/Taiga/Fake_news.rar",
)
TAIGA_LENTA_FILE = DatasetFile(
    filename="taiga_lenta.db.zip",
    sha256=TAIGA_LENTA_SHA256,
    url="https://linghub.ru/static/Taiga/Lenta.db.zip",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_dataset_file(spec: DatasetFile, force: bool = False) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    destination = RAW_DIR / spec.filename
    if destination.exists() and not force and sha256_file(destination) == spec.sha256:
        return destination

    request = urllib.request.Request(spec.url, headers={"User-Agent": "RuFact-ML/1.0"})
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)

    actual_hash = sha256_file(temporary)
    if actual_hash != spec.sha256:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(
            f"Checksum mismatch for {spec.filename}: expected {spec.sha256}, got {actual_hash}."
        )
    temporary.replace(destination)
    return destination


def _archive_tool() -> str:
    for candidate in ("bsdtar", "tar"):
        executable = shutil.which(candidate)
        if executable:
            return executable
    raise RuntimeError(
        "Taiga extraction requires bsdtar/libarchive. Install libarchive-tools and retry."
    )


def ensure_taiga_directory(archive_path: Path, force: bool = False) -> Path:
    destination = RAW_DIR / "taiga_fake_news"
    metadata_path = destination / "Panorama" / "metatable.csv"
    if metadata_path.is_file() and not force:
        return destination / "Panorama"

    tool = _archive_tool()
    try:
        listing = subprocess.run(
            [tool, "-tf", str(archive_path)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        ).stdout.splitlines()
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            "The available tar command cannot read Taiga's RAR archive. "
            "Install bsdtar/libarchive-tools and retry."
        ) from error

    for member in listing:
        path = PurePosixPath(member.replace("\\", "/"))
        if path.is_absolute() or ".." in path.parts:
            raise RuntimeError(f"Unsafe path in Taiga archive: {member}")

    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    subprocess.run(
        [tool, "-xf", str(archive_path), "-C", str(destination)],
        check=True,
        capture_output=True,
    )
    if not metadata_path.is_file():
        raise RuntimeError("Taiga archive does not contain Panorama/metatable.csv.")
    return destination / "Panorama"


def ensure_lenta_database(archive_path: Path, force: bool = False) -> Path:
    destination = RAW_DIR / "taiga_lenta" / "Lenta.db"
    if destination.is_file() and not force:
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if names != ["Lenta.db"]:
            raise RuntimeError(f"Unexpected files in Taiga Lenta archive: {names}")
        archive.extract("Lenta.db", destination.parent)
    if not destination.is_file():
        raise RuntimeError("Taiga Lenta archive did not produce Lenta.db.")
    return destination


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _main_label(row: dict[str, Any]) -> int:
    news_id = str(row["data"]["NEWS_ID"])
    if news_id.startswith("FAKE_RU_NEWS_"):
        return 1
    if news_id.startswith("REAL_RU_NEWS_"):
        return 0
    raise ValueError(f"Unexpected NEWS_ID: {news_id}")


def _pair_group(row: dict[str, Any]) -> int:
    news_id = str(row["data"]["NEWS_ID"])
    match = re.search(r"_(\d+)$", news_id)
    if not match:
        raise ValueError(f"NEWS_ID has no numeric suffix: {news_id}")
    return int(match.group(1))


def load_main_dataset(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, int]]:
    rows = _read_json(path)
    seen: dict[str, tuple[int, int]] = {}
    parents: dict[int, int] = {}
    texts: list[str] = []
    labels: list[int] = []
    groups: list[int] = []
    duplicates = 0

    def root(group: int) -> int:
        parents.setdefault(group, group)
        while parents[group] != group:
            parents[group] = parents[parents[group]]
            group = parents[group]
        return group

    for row in rows:
        text = normalize_for_model(str(row["data"]["text"]))
        if not text:
            continue
        label = _main_label(row)
        group = _pair_group(row)
        root(group)
        if text in seen:
            previous_label, previous_group = seen[text]
            if previous_label != label:
                raise ValueError("Main dataset contains conflicting labels for the same text.")
            # Keeping just one duplicated text is not enough: the paired opposite-class
            # rows must also stay in the same fold across all duplicate source IDs.
            old_root, new_root = root(previous_group), root(group)
            parents[max(old_root, new_root)] = min(old_root, new_root)
            duplicates += 1
            continue
        seen[text] = (label, group)
        texts.append(text)
        labels.append(label)
        groups.append(group)

    counts = Counter(labels)
    merged_groups = np.asarray([root(group) for group in groups])
    summary = {
        "rawSamples": len(rows),
        "samples": len(texts),
        "real": counts[0],
        "fake": counts[1],
        "exactDuplicatesRemoved": duplicates,
        "pairedGroupsBeforeDuplicateMerging": len(parents),
        "leakageSafeGroups": len(set(merged_groups.tolist())),
    }
    return np.asarray(texts, dtype=object), np.asarray(labels), merged_groups, summary


def load_external_dataset(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, int]]:
    rows = [row for row in _read_json(path) if row.get("Language") == "RU"]
    if any(row.get("Class") not in {"REAL", "FAKE"} for row in rows):
        raise ValueError("External Russian dataset contains an unknown class label.")
    texts = np.asarray([normalize_for_model(str(row["TEXT"])) for row in rows], dtype=object)
    labels = np.asarray([1 if row["Class"] == "FAKE" else 0 for row in rows])
    sources = np.asarray([str(row["Source"]) for row in rows], dtype=object)
    if any(not text for text in texts) or any(not source.strip() for source in sources):
        raise ValueError("External Russian dataset contains blank text or source metadata.")
    if len(set(texts.tolist())) != len(texts):
        raise RuntimeError("External Russian evaluation data contains exact duplicate texts.")
    counts = Counter(labels.tolist())
    summary = {"samples": len(texts), "real": counts[0], "fake": counts[1]}
    return texts, labels, sources, summary


def load_taiga_dataset(path: Path) -> tuple[np.ndarray, dict[str, int]]:
    metadata: dict[str, str] = {}
    with (path / "metatable.csv").open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            metadata[str(row["text_id"])] = str(row["title"])

    texts: list[str] = []
    for tagged_path in sorted(
        (path / "tagged_texts").glob("*.txt"), key=lambda item: int(item.stem)
    ):
        sentences = [
            line.removeprefix("# text = ")
            for line in tagged_path.read_text(encoding="utf-8").splitlines()
            if line.startswith("# text = ")
        ]
        text = normalize_for_model(f"{metadata.get(tagged_path.stem, '')} {' '.join(sentences)}")
        if text:
            texts.append(text)

    unique_texts = list(dict.fromkeys(texts))
    if len(unique_texts) != TAIGA_EXPECTED_SAMPLES:
        raise RuntimeError(
            f"Expected {TAIGA_EXPECTED_SAMPLES} Taiga samples, found {len(unique_texts)}."
        )
    return np.asarray(unique_texts, dtype=object), {
        "rawSamples": len(texts),
        "samples": len(unique_texts),
        "fake": len(unique_texts),
        "exactDuplicatesRemoved": len(texts) - len(unique_texts),
    }


def _text_from_tagged_document(title: str, tagged: str) -> str:
    sentences = [
        line.removeprefix("# text = ")
        for line in tagged.splitlines()
        if line.startswith("# text = ")
        and not line.removeprefix("# text = ").startswith("#")
    ]
    return normalize_for_model(f"{title} {' '.join(sentences)}")


def load_lenta_dataset(
    path: Path,
    excluded_texts: set[str],
    sample_size: int = TAIGA_EXPECTED_SAMPLES,
) -> tuple[np.ndarray, dict[str, int]]:
    texts: list[str] = []
    seen = set(excluded_texts)
    with closing(sqlite3.connect(path)) as connection:
        ids = [str(row[0]) for row in connection.execute("SELECT id FROM tagged_texts")]
        ranked_ids = sorted(
            ids, key=lambda text_id: hashlib.sha256(f"{SEED}:{text_id}".encode()).digest()
        )
        # Fetch bounded batches rather than one SQL query per selected article. Keep
        # the predeclared hash order: SQLite's IN clause does not preserve that order.
        for offset in range(0, len(ranked_ids), 200):
            batch = ranked_ids[offset : offset + 200]
            placeholders = ",".join("?" for _ in batch)
            records = {
                str(row[0]): (str(row[1]), str(row[2]))
                for row in connection.execute(
                    f"""
                    SELECT tagged_texts.id, COALESCE(meta.textname, ''), tagged_texts.text
                    FROM tagged_texts
                    LEFT JOIN meta ON meta.textid = tagged_texts.id
                    WHERE tagged_texts.id IN ({placeholders})
                    """,
                    batch,
                )
            }
            for text_id in batch:
                row = records.get(text_id)
                if row is None:
                    continue
                text = _text_from_tagged_document(*row)
                if not text or text in seen:
                    continue
                seen.add(text)
                texts.append(text)
                if len(texts) == sample_size:
                    break
            if len(texts) == sample_size:
                break

    if len(texts) != sample_size:
        raise RuntimeError(f"Expected {sample_size} Taiga Lenta samples, found {len(texts)}.")
    return np.asarray(texts, dtype=object), {
        "availableSamples": len(ids),
        "samples": len(texts),
        "real": len(texts),
        "selectionSeed": SEED,
    }


def build_base_model() -> Pipeline:
    return Pipeline(
        [
            (
                "features",
                FeatureUnion(
                    [
                        (
                            "word",
                            TfidfVectorizer(
                                lowercase=True,
                                ngram_range=(1, 2),
                                min_df=2,
                                max_df=0.98,
                                max_features=60_000,
                                sublinear_tf=True,
                                norm="l2",
                            ),
                        ),
                        (
                            "char",
                            TfidfVectorizer(
                                analyzer="char_wb",
                                lowercase=True,
                                ngram_range=(3, 5),
                                min_df=2,
                                max_features=100_000,
                                sublinear_tf=True,
                                norm="l2",
                            ),
                        ),
                    ],
                    transformer_weights={"word": 1.0, "char": 0.6},
                ),
            ),
            (
                "classifier",
                LogisticRegression(
                    C=2.0,
                    solver="liblinear",
                    max_iter=2_000,
                    class_weight="balanced",
                    random_state=SEED,
                ),
            ),
        ]
    )


def dataset_fingerprint(texts: np.ndarray, labels: np.ndarray) -> str:
    """Bind reproducibility metadata to the ordered, normalized model inputs."""
    if len(texts) != len(labels):
        raise ValueError("Dataset text and label counts differ.")
    digest = hashlib.sha256()
    for text, label in zip(texts, labels, strict=True):
        record = json.dumps([str(text), int(label)], ensure_ascii=False, separators=(",", ":"))
        digest.update(record.encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def _log_odds(probabilities: np.ndarray) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-8, 1 - 1e-8)
    return np.log(clipped / (1 - clipped)).reshape(-1, 1)


def _new_calibrator(c_value: float) -> LogisticRegression:
    return LogisticRegression(
        C=c_value,
        solver="liblinear",
        class_weight="balanced",
        random_state=SEED,
    )


def _classification_metrics(labels: np.ndarray, probabilities: np.ndarray) -> dict[str, Any]:
    predictions = (probabilities >= 0.5).astype(int)
    return {
        "accuracy": round(float(accuracy_score(labels, predictions)), 6),
        "macroF1": round(float(f1_score(labels, predictions, average="macro")), 6),
        "precisionFake": round(float(precision_score(labels, predictions, zero_division=0)), 6),
        "recallFake": round(float(recall_score(labels, predictions, zero_division=0)), 6),
        "precisionReal": round(
            float(precision_score(labels, predictions, pos_label=0, zero_division=0)), 6
        ),
        "recallReal": round(
            float(recall_score(labels, predictions, pos_label=0, zero_division=0)), 6
        ),
        "rocAuc": round(float(roc_auc_score(labels, probabilities)), 6),
        "brierScore": round(float(brier_score_loss(labels, probabilities)), 6),
        "logLoss": round(float(log_loss(labels, probabilities)), 6),
        "confusionMatrix": confusion_matrix(labels, predictions, labels=[0, 1]).tolist(),
    }


def _stratified_bootstrap_intervals(
    labels: np.ndarray,
    probabilities: np.ndarray,
    iterations: int = 2_000,
) -> dict[str, list[float]]:
    rng = np.random.default_rng(SEED)
    by_class = [np.flatnonzero(labels == value) for value in (0, 1)]
    accuracy_values: list[float] = []
    macro_f1_values: list[float] = []
    predictions = probabilities >= 0.5
    for _ in range(iterations):
        sample = np.concatenate(
            [rng.choice(indices, size=len(indices), replace=True) for indices in by_class]
        )
        accuracy_values.append(float(accuracy_score(labels[sample], predictions[sample])))
        macro_f1_values.append(
            float(f1_score(labels[sample], predictions[sample], average="macro"))
        )

    return {
        "accuracy95": [
            round(float(value), 6) for value in np.percentile(accuracy_values, [2.5, 97.5])
        ],
        "macroF195": [
            round(float(value), 6) for value in np.percentile(macro_f1_values, [2.5, 97.5])
        ],
    }


def evaluate_internal(
    texts: np.ndarray,
    labels: np.ndarray,
    groups: np.ndarray,
) -> dict[str, Any]:
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    probabilities = cross_val_predict(
        build_base_model(),
        texts,
        labels,
        groups=groups,
        cv=splitter,
        method="predict_proba",
        n_jobs=1,
    )[:, 1]
    return {
        "protocol": (
            "5-fold stratified group cross-validation; paired REAL/FAKE source IDs stay "
            "in the same fold; pair groups connected by duplicate texts are merged; "
            "exact normalized duplicates removed"
        ),
        "samples": int(len(texts)),
        "metrics": _classification_metrics(labels, probabilities),
    }


def _select_calibration_c(
    log_odds: np.ndarray,
    labels: np.ndarray,
    splits: list[tuple[np.ndarray, np.ndarray]],
) -> tuple[float, dict[str, float]]:
    scores: dict[str, float] = {}
    for c_value in CALIBRATION_CANDIDATES:
        probabilities = np.zeros(len(labels), dtype=float)
        for train_indices, validation_indices in splits:
            calibrator = _new_calibrator(c_value)
            calibrator.fit(log_odds[train_indices], labels[train_indices])
            probabilities[validation_indices] = calibrator.predict_proba(
                log_odds[validation_indices]
            )[:, 1]
        score = f1_score(labels, probabilities >= 0.5, average="macro")
        scores[str(c_value)] = round(float(score), 6)

    selected = max(
        CALIBRATION_CANDIDATES,
        key=lambda candidate: (scores[str(candidate)], -candidate),
    )
    return selected, scores


def evaluate_external_nested(
    raw_probabilities: np.ndarray,
    labels: np.ndarray,
) -> tuple[dict[str, Any], np.ndarray]:
    log_odds = _log_odds(raw_probabilities)
    outer = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    out_of_fold = np.zeros(len(labels), dtype=float)
    selected_values: list[float] = []

    for fold, (train_indices, test_indices) in enumerate(outer.split(log_odds, labels), start=1):
        inner_splitter = StratifiedKFold(n_splits=4, shuffle=True, random_state=SEED + fold)
        inner_splits = list(inner_splitter.split(log_odds[train_indices], labels[train_indices]))
        selected_c, _ = _select_calibration_c(
            log_odds[train_indices], labels[train_indices], inner_splits
        )
        selected_values.append(selected_c)
        calibrator = _new_calibrator(selected_c)
        calibrator.fit(log_odds[train_indices], labels[train_indices])
        out_of_fold[test_indices] = calibrator.predict_proba(log_odds[test_indices])[:, 1]

    evaluation = {
        "protocol": (
            "Nested 5-fold out-of-fold evaluation on authentic Russian examples. "
            "Each outer fold is untouched while calibration strength is selected by "
            "4-fold cross-validation inside the remaining examples."
        ),
        "samples": int(len(labels)),
        "outerFolds": 5,
        "selectedCalibrationC": selected_values,
        "metrics": _classification_metrics(labels, out_of_fold),
        "confidenceIntervals": _stratified_bootstrap_intervals(labels, out_of_fold),
    }
    return evaluation, out_of_fold


def fit_final_calibrator(
    raw_probabilities: np.ndarray,
    labels: np.ndarray,
) -> tuple[LogisticRegression, float, dict[str, float]]:
    log_odds = _log_odds(raw_probabilities)
    splitter = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    selected_c, scores = _select_calibration_c(
        log_odds, labels, list(splitter.split(log_odds, labels))
    )
    calibrator = _new_calibrator(selected_c)
    calibrator.fit(log_odds, labels)
    return calibrator, selected_c, scores


def train(force_download: bool = False) -> dict[str, Any]:
    main_path = ensure_dataset_file(MAIN_FILE, force=force_download)
    external_path = ensure_dataset_file(EXTERNAL_FILE, force=force_download)
    taiga_archive = ensure_dataset_file(TAIGA_FILE, force=force_download)
    taiga_path = ensure_taiga_directory(taiga_archive, force=force_download)
    lenta_archive = ensure_dataset_file(TAIGA_LENTA_FILE, force=force_download)
    lenta_path = ensure_lenta_database(lenta_archive, force=force_download)
    main_texts, main_labels, main_groups, main_summary = load_main_dataset(main_path)
    external_texts, external_labels, external_sources, external_summary = load_external_dataset(
        external_path
    )
    taiga_texts, taiga_summary = load_taiga_dataset(taiga_path)
    main_set = set(main_texts.tolist())
    external_set = set(external_texts.tolist())
    taiga_set = set(taiga_texts.tolist())
    if main_set.intersection(external_set):
        raise RuntimeError("Main and external datasets overlap after normalization.")
    if taiga_set.intersection(main_set) or taiga_set.intersection(external_set):
        raise RuntimeError("Taiga data overlaps another dataset after normalization.")
    lenta_texts, lenta_summary = load_lenta_dataset(
        lenta_path, main_set | external_set | taiga_set
    )

    training_texts = np.concatenate([main_texts, taiga_texts, lenta_texts])
    training_labels = np.concatenate(
        [
            main_labels,
            np.ones(len(taiga_texts), dtype=main_labels.dtype),
            np.zeros(len(lenta_texts), dtype=main_labels.dtype),
        ]
    )
    training_summary = {
        "samples": int(len(training_texts)),
        "real": int(np.count_nonzero(training_labels == 0)),
        "fake": int(np.count_nonzero(training_labels == 1)),
    }

    print("Evaluating grouped in-domain performance...", flush=True)
    internal_evaluation = evaluate_internal(main_texts, main_labels, main_groups)

    print("Fitting base model...", flush=True)
    base_model = build_base_model()
    base_model.fit(training_texts, training_labels)
    raw_external = base_model.predict_proba(external_texts)[:, 1]

    print("Running nested external calibration evaluation...", flush=True)
    external_evaluation, _ = evaluate_external_nested(raw_external, external_labels)
    calibrator, selected_c, calibration_scores = fit_final_calibrator(raw_external, external_labels)

    trained_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    limitations = [
        (
            "The core FAKE class is synthetic; auxiliary data contrasts Panorama satire "
            "with a deterministic Lenta news sample."
        ),
        (
            "The external Russian evaluation set has only 157 Kazakhstan-focused texts "
            "and its labels are confounded with source."
        ),
        (
            "The external set was used for historical baseline comparisons; nested "
            "calibration estimates are not a fresh, untouched release-test score."
        ),
        "The model classifies wording patterns and does not retrieve or verify evidence.",
        "Confidence can become miscalibrated on new topics, sources, or adversarial paraphrases.",
        "Binary REAL/FAKE labels do not represent satire, opinion, or partially true claims.",
    ]
    metrics = {
        "schemaVersion": 1,
        "generatedAt": trained_at,
        "modelName": MODEL_NAME,
        "modelVersion": MODEL_VERSION,
        "maxTextLength": MAX_TEXT_LENGTH,
        "dataset": {
            "name": "KazFakeCorpus Russian subset + balanced Taiga news sample",
            "revision": DATASET_REVISION,
            "licenses": ["KazFakeCorpus: CC BY 4.0", "Taiga: personal/research use"],
            "training": training_summary,
            "normalizedTrainingSha256": dataset_fingerprint(training_texts, training_labels),
            "normalizedExternalSha256": dataset_fingerprint(external_texts, external_labels),
            "main": main_summary,
            "auxiliary": {
                "fake": {
                    **taiga_summary,
                    "name": "Taiga Panorama satire collection",
                    "archiveSha256": TAIGA_ARCHIVE_SHA256,
                },
                "real": {
                    **lenta_summary,
                    "name": "Deterministic sample from Taiga Lenta",
                    "archiveSha256": TAIGA_LENTA_SHA256,
                },
            },
            "external": {**external_summary, "sources": sorted(set(external_sources.tolist()))},
        },
        "evaluation": {
            "headline": "externalNestedCrossValidation",
            "inDomainGroupedCrossValidation": internal_evaluation,
            "externalNestedCrossValidation": external_evaluation,
            "finalCalibration": {
                "method": "sigmoid over base-model log-odds",
                "selectedC": selected_c,
                "crossValidatedMacroF1ByC": calibration_scores,
            },
        },
        "limitations": limitations,
        "reproducibility": {
            "seed": SEED,
            "numpyVersion": np.__version__,
            "sklearnVersion": sklearn.__version__,
            "baseHyperparametersChangedInThisRun": False,
            "externalSetUsedToTuneBaseModelInThisRun": False,
        },
    }
    artifact = {
        "schema_version": 1,
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "trained_at": trained_at,
        "base_model": base_model,
        "calibrator": calibrator,
        "metrics": metrics,
        "sklearn_version": sklearn.__version__,
        "dataset_revision": DATASET_REVISION,
    }

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = ARTIFACT_DIR / "model.joblib"
    metrics_path = ARTIFACT_DIR / "metrics.json"
    manifest_path = ARTIFACT_DIR / "artifact-manifest.json"
    temporary_artifact = artifact_path.with_suffix(".joblib.tmp")
    joblib.dump(artifact, temporary_artifact, compress=3)
    temporary_artifact.replace(artifact_path)
    metrics_path.write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    manifest = {
        "schemaVersion": 1,
        "filename": artifact_path.name,
        "sha256": sha256_file(artifact_path),
        "bytes": artifact_path.stat().st_size,
        "modelVersion": MODEL_VERSION,
        "sklearnVersion": sklearn.__version__,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate the RuFact baseline model.")
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Download the pinned dataset files again even when verified files exist.",
    )
    args = parser.parse_args()
    metrics = train(force_download=args.force_download)
    headline = metrics["evaluation"]["externalNestedCrossValidation"]["metrics"]
    print(
        "External OOF metrics: "
        f"accuracy={headline['accuracy']:.3f}, macro_f1={headline['macroF1']:.3f}, "
        f"precision_fake={headline['precisionFake']:.3f}, "
        f"recall_fake={headline['recallFake']:.3f}",
        flush=True,
    )


if __name__ == "__main__":
    main()
