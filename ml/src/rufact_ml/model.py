from __future__ import annotations

import hashlib
import json
import math
import os
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn

from rufact_ml.schemas import (
    AnalysisMeta,
    AnalysisSignal,
    DetectedLanguage,
    EvidenceSpan,
    ModelInfoResponse,
    ModelLanguage,
    PredictionResponse,
)

MAX_TEXT_LENGTH = 5000
DEFAULT_ARTIFACT_PATH = Path(__file__).resolve().parents[2] / "artifacts" / "model.joblib"
DEFAULT_ENGLISH_ARTIFACT_PATH = (
    Path(__file__).resolve().parents[2] / "artifacts" / "en" / "model.joblib"
)
LANGUAGE_SCRIPT_DOMINANCE = 0.60
MIN_LANGUAGE_LETTERS = 3
_SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
_APOSTROPHE_TRANSLATION = str.maketrans(
    {
        "\u0060": "'",
        "\u00b4": "'",
        "\u02bb": "'",
        "\u02bc": "'",
        "\u2018": "'",
        "\u2019": "'",
    }
)
_UZBEK_CYRILLIC_MARKERS = frozenset("ўқғҳһәіңөұү")
_UZBEK_CYRILLIC_WORDS = frozenset(
    {
        "ва",
        "бу",
        "учун",
        "билан",
        "ҳам",
        "эмас",
        "деб",
        "бўлган",
        "ўзбекистон",
        "орқали",
        "ёки",
        "ҳақида",
        "унинг",
        "улар",
        "эди",
        "бўлади",
        "томонидан",
    }
)
_RUSSIAN_WORDS = frozenset(
    {
        "и",
        "в",
        "на",
        "что",
        "это",
        "как",
        "по",
        "из",
        "для",
        "не",
        "от",
        "но",
        "уже",
        "был",
        "она",
        "они",
        "который",
        "сообщил",
    }
)
_UZBEK_LATIN_WORDS = frozenset(
    {
        "va",
        "bu",
        "uchun",
        "bilan",
        "ham",
        "emas",
        "bir",
        "deb",
        "bo'lgan",
        "o'zbekiston",
        "shuningdek",
        "orqali",
        "yoki",
        "haqida",
        "uning",
        "ular",
        "edi",
        "bo'ladi",
        "tomonidan",
        "kerak",
        "mumkin",
    }
)
_ENGLISH_WORDS = frozenset(
    {
        "the",
        "and",
        "is",
        "are",
        "was",
        "were",
        "of",
        "to",
        "in",
        "that",
        "for",
        "on",
        "with",
        "as",
        "by",
        "from",
        "this",
        "it",
        "has",
        "have",
        "will",
        "an",
        "be",
        "or",
        "not",
        "which",
        "who",
    }
)
_UZBEK_APOSTROPHE_PATTERN = re.compile(
    r"\b(?:o'|g'|bo'l|to'g'|ma'lumot|e'lon|ta'lim)[a-z]*",
    flags=re.IGNORECASE,
)


def normalize_for_model(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", normalized).strip()[:MAX_TEXT_LENGTH]


def _language_tokens(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    normalized = normalized.translate(_APOSTROPHE_TRANSLATION)
    return re.findall(r"[^\W\d_]+(?:'[^\W\d_]+)*", normalized, flags=re.UNICODE)


def _script_counts(text: str) -> tuple[int, int, int]:
    cyrillic = 0
    latin = 0
    alphabetic = 0
    for character in text:
        if not character.isalpha():
            continue
        alphabetic += 1
        unicode_name = unicodedata.name(character, "")
        if "CYRILLIC" in unicode_name:
            cyrillic += 1
        elif "LATIN" in unicode_name:
            latin += 1
    return cyrillic, latin, alphabetic


def detect_language(text: str) -> DetectedLanguage:
    """Conservatively identify supported content languages without network lookups.

    Script dominance separates Cyrillic from Latin text. Lexical checks exist primarily
    to keep Uzbek out of the Russian and English classifiers; this is not a general-purpose
    language detector.
    """

    normalized = normalize_for_model(text)
    cyrillic, latin, alphabetic = _script_counts(normalized)
    if alphabetic < MIN_LANGUAGE_LETTERS:
        return "unknown"

    tokens = _language_tokens(normalized)
    if cyrillic >= MIN_LANGUAGE_LETTERS and cyrillic / alphabetic >= LANGUAGE_SCRIPT_DOMINANCE:
        lowered = normalized.casefold()
        if any(marker in lowered for marker in _UZBEK_CYRILLIC_MARKERS):
            return "uz"
        uzbek_score = sum(token in _UZBEK_CYRILLIC_WORDS for token in tokens)
        russian_score = sum(token in _RUSSIAN_WORDS for token in tokens)
        if uzbek_score >= 2 and uzbek_score > russian_score:
            return "uz"
        return "ru"

    if latin >= MIN_LANGUAGE_LETTERS and latin / alphabetic >= LANGUAGE_SCRIPT_DOMINANCE:
        canonical = normalized.casefold().translate(_APOSTROPHE_TRANSLATION)
        marker_count = len(_UZBEK_APOSTROPHE_PATTERN.findall(canonical))
        uzbek_score = sum(token in _UZBEK_LATIN_WORDS for token in tokens)
        english_score = sum(token in _ENGLISH_WORDS for token in tokens)
        if marker_count >= 2:
            return "uz"
        if marker_count >= 1 and uzbek_score >= 2 and uzbek_score > english_score:
            return "uz"
        if uzbek_score >= 3 and uzbek_score > english_score:
            return "uz"
        return "en"

    return "unknown"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact_path(language: ModelLanguage) -> Path:
    if language == "ru":
        configured = os.getenv("RUFACT_RU_MODEL_PATH", "").strip()
        configured = configured or os.getenv("RUFACT_MODEL_PATH", "").strip()
        return Path(configured or DEFAULT_ARTIFACT_PATH)
    configured = os.getenv("RUFACT_EN_MODEL_PATH", "").strip()
    return Path(configured or DEFAULT_ENGLISH_ARTIFACT_PATH)


def _configured_artifact_hash(language: ModelLanguage) -> str | None:
    if language == "ru":
        configured = os.getenv("RUFACT_RU_MODEL_SHA256", "").strip().lower()
        configured = configured or os.getenv("RUFACT_MODEL_SHA256", "").strip().lower()
    else:
        configured = os.getenv("RUFACT_EN_MODEL_SHA256", "").strip().lower()
    if configured and not _SHA256_PATTERN.fullmatch(configured):
        raise RuntimeError(f"Configured {language} model checksum is not a SHA-256 value.")
    return configured or None


def _artifact_manifest(path: Path) -> dict[str, Any]:
    manifest_path = path.with_name("artifact-manifest.json")
    if not manifest_path.is_file():
        raise RuntimeError(f"Model artifact manifest not found at {manifest_path}.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Model artifact manifest is invalid at {manifest_path}.") from error
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1:
        raise RuntimeError("Model artifact manifest schema version is not supported.")
    return manifest


def _expected_artifact_hash(
    path: Path,
    language: ModelLanguage,
    manifest: dict[str, Any],
) -> str:
    configured = _configured_artifact_hash(language)
    manifest_hash = manifest.get("sha256")
    if not isinstance(manifest_hash, str) or not _SHA256_PATTERN.fullmatch(manifest_hash.lower()):
        raise RuntimeError("Model artifact manifest does not contain a valid SHA-256 value.")
    if configured and configured != manifest_hash.lower():
        raise RuntimeError("Configured model checksum does not match artifact-manifest.json.")
    return configured or manifest_hash.lower()


def _find_span(text: str, feature: str) -> tuple[int, int, str] | None:
    tokens = feature.split()
    if not tokens or len(feature) > 90:
        return None

    pattern = r"\s+".join(re.escape(token) for token in tokens)
    match = re.search(pattern, text, flags=re.IGNORECASE | re.UNICODE)
    if not match:
        return None
    return match.start(), match.end(), text[match.start() : match.end()]


@dataclass(slots=True)
class ModelBundle:
    artifact: dict[str, Any]
    _word_vectorizer: Any = field(init=False, repr=False)
    _word_feature_names: np.ndarray = field(init=False, repr=False)
    _word_coefficients: np.ndarray = field(init=False, repr=False)

    def __post_init__(self) -> None:
        # Fitted feature metadata is immutable across predictions. Constructing the
        # full vocabulary array on every request costs more than inference itself.
        steps = self.base_model.named_steps
        classifier = steps["classifier"]
        if "tfidf" in steps:
            vectorizer = steps["tfidf"]
            names = vectorizer.get_feature_names_out()
            coefficients = classifier.coef_[0]
        else:
            features = steps["features"]
            vectorizer = dict(features.transformer_list)["word"]
            names = vectorizer.get_feature_names_out()
            weight = float((features.transformer_weights or {}).get("word", 1.0))
            coefficients = classifier.coef_[0][: len(names)] * weight

        # Own the arrays so making the cache read-only cannot alter estimator state.
        self._word_vectorizer = vectorizer
        self._word_feature_names = np.array(names, copy=True)
        self._word_coefficients = np.array(coefficients, copy=True)
        self._word_feature_names.setflags(write=False)
        self._word_coefficients.setflags(write=False)

    @property
    def language(self) -> ModelLanguage:
        return self.artifact.get("language", "ru")

    @property
    def version(self) -> str:
        return str(self.artifact["model_version"])

    @property
    def metrics(self) -> dict[str, Any]:
        return dict(self.artifact["metrics"])

    @property
    def base_model(self) -> Any:
        return self.artifact["base_model"]

    @property
    def calibrator(self) -> Any:
        return self.artifact["calibrator"]

    def _fake_probability(self, text: str) -> float:
        normalized = normalize_for_model(text)
        raw_probability = float(self.base_model.predict_proba([normalized])[0, 1])
        clipped = min(max(raw_probability, 1e-8), 1 - 1e-8)
        log_odds = math.log(clipped / (1 - clipped))
        calibrated = float(self.calibrator.predict_proba([[log_odds]])[0, 1])
        return min(max(calibrated, 0.0), 1.0)

    def _word_explanation_features(self, text: str) -> tuple[Any, np.ndarray, np.ndarray]:
        return (
            self._word_vectorizer.transform([text]),
            self._word_feature_names,
            self._word_coefficients,
        )

    def _explanations(
        self,
        original_text: str,
        normalized_text: str,
        label: str,
        limit: int = 4,
    ) -> tuple[list[AnalysisSignal], list[EvidenceSpan]]:
        vector, feature_names, coefficients = self._word_explanation_features(normalized_text)
        row = vector.tocsr()
        contributions = row.data * coefficients[row.indices]
        direction = 1 if label == "FAKE" else -1
        ranked = np.argsort(-(contributions * direction))
        tone = "risk" if label == "FAKE" else "reassuring"
        signals: list[AnalysisSignal] = []
        evidence: list[EvidenceSpan] = []
        occupied: list[tuple[int, int]] = []

        for position in ranked:
            contribution = float(contributions[position]) * direction
            if contribution <= 0:
                break

            feature = str(feature_names[row.indices[position]])
            span = _find_span(original_text, feature)
            if span is None:
                continue
            start, end, quote = span
            if any(start < used_end and end > used_start for used_start, used_end in occupied):
                continue

            signal_id = f"model-feature-{len(signals) + 1}"
            evidence_id = f"{signal_id}-evidence"
            severity = "high" if len(signals) == 0 else "medium" if len(signals) < 3 else "low"
            signals.append(
                AnalysisSignal(
                    id=signal_id,
                    title=(
                        f"Statistical feature: “{quote}”"
                        if self.language == "en"
                        else f"Статистический маркер: «{quote}»"
                    ),
                    description=(
                        f"This phrase contributed to the statistical class {label}. "
                        "This explains a model decision, not the truth of the claim."
                    )
                    if self.language == "en"
                    else (
                        f"Эта фраза внесла заметный вклад в выбор класса {label}. "
                        "Это объяснение решения модели, а не доказательство истинности факта."
                    ),
                    tone=tone,
                    severity=severity,
                    evidenceIds=[evidence_id],
                )
            )
            evidence.append(
                EvidenceSpan(
                    id=evidence_id,
                    start=start,
                    end=end,
                    quote=quote,
                    signalId=signal_id,
                    tone=tone,
                )
            )
            occupied.append((start, end))
            if len(signals) >= limit:
                break

        return signals, evidence

    def predict(self, text: str) -> PredictionResponse:
        normalized = normalize_for_model(text)
        fake_probability = self._fake_probability(normalized)
        label = "FAKE" if fake_probability >= 0.5 else "REAL"
        confidence = fake_probability if label == "FAKE" else 1 - fake_probability
        signals, evidence = self._explanations(text, normalized, label)
        explanation = (
            (
                f"The English text-only classifier assigned statistical class {label} from "
                "word and character patterns. Highlighted phrases explain feature contributions; "
                "no internet evidence or factual truth was checked by this model."
            )
            if self.language == "en"
            else (
                f"ML-классификатор отнёс текст к классу {label} по статистическому сочетанию "
                "слов и фраз. Выделенные фрагменты показывают вклад признаков модели; "
                "внешние источники и фактическая истинность утверждений не проверялись."
            )
        )
        return PredictionResponse(
            label=label,
            confidence=round(confidence, 6),
            explanation=explanation,
            signals=signals,
            evidence=evidence,
            meta=AnalysisMeta(engineVersion=self.version, language=self.language),
        )

    def info(self) -> ModelInfoResponse:
        evaluation = self.metrics["evaluation"]
        return ModelInfoResponse(
            language=self.language,
            modelVersion=self.version,
            modelName=str(self.artifact["model_name"]),
            trainedAt=str(self.artifact["trained_at"]),
            maxTextLength=MAX_TEXT_LENGTH,
            evaluation=evaluation,
            limitations=list(self.metrics["limitations"]),
        )


def load_model_bundle(path: Path | None = None, language: ModelLanguage = "ru") -> ModelBundle:
    artifact_path = path or _artifact_path(language)
    artifact_path = artifact_path.resolve()
    if not artifact_path.is_file():
        raise FileNotFoundError(
            f"Model artifact not found at {artifact_path}. Run `uv run --project ml rufact-train`."
        )

    manifest = _artifact_manifest(artifact_path)
    expected_hash = _expected_artifact_hash(artifact_path, language, manifest)
    if _sha256(artifact_path) != expected_hash:
        raise RuntimeError("Model artifact checksum does not match artifact-manifest.json.")

    artifact = joblib.load(artifact_path)
    required = {
        "schema_version",
        "model_name",
        "model_version",
        "trained_at",
        "base_model",
        "calibrator",
        "metrics",
    }
    if not isinstance(artifact, dict) or not required.issubset(artifact):
        raise RuntimeError("Model artifact has an unsupported shape.")
    if artifact["schema_version"] != 1:
        raise RuntimeError("Model artifact schema version is not supported.")
    if artifact.get("language", "ru") != language:
        raise RuntimeError("Model artifact language does not match the requested language.")
    if manifest.get("language", "ru") != language:
        raise RuntimeError("Model manifest language does not match the requested language.")
    if (
        manifest.get("filename") != artifact_path.name
        or manifest.get("modelVersion") != artifact["model_version"]
        or manifest.get("bytes") != artifact_path.stat().st_size
    ):
        raise RuntimeError("Model artifact metadata does not match its manifest.")
    if artifact.get("sklearn_version") != sklearn.__version__:
        raise RuntimeError("Model scikit-learn version does not match the installed runtime.")
    if manifest.get("sklearnVersion") != sklearn.__version__:
        raise RuntimeError("Model manifest scikit-learn version does not match runtime.")
    for model in (artifact["base_model"], artifact["calibrator"]):
        if not hasattr(model, "predict_proba") or set(model.classes_) != {0, 1}:
            raise RuntimeError("Model does not provide the expected binary probabilities.")
    return ModelBundle(artifact=artifact)
