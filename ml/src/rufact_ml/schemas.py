from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

AnalysisLabel = Literal["REAL", "FAKE"]
SignalTone = Literal["risk", "reassuring"]
SignalSeverity = Literal["low", "medium", "high"]
ModelLanguage = Literal["ru", "en"]
DetectedLanguage = Literal["ru", "en", "uz", "unknown"]
RequestedLanguage = Literal["auto", "ru", "en", "uz"]
AnalysisText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=5000),
]


class PredictionRequest(BaseModel):
    text: AnalysisText
    language: RequestedLanguage = "auto"


class EvidenceSpan(BaseModel):
    id: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    quote: str
    signalId: str
    tone: SignalTone


class AnalysisSignal(BaseModel):
    id: str
    title: str
    description: str
    tone: SignalTone
    severity: SignalSeverity
    evidenceIds: list[str]


class AnalysisMeta(BaseModel):
    engine: Literal["external-model"] = "external-model"
    engineVersion: str
    externalSourcesChecked: Literal[False] = False
    language: ModelLanguage


class PredictionResponse(BaseModel):
    label: AnalysisLabel
    confidence: float = Field(ge=0, le=1)
    explanation: str
    signals: list[AnalysisSignal]
    evidence: list[EvidenceSpan]
    meta: AnalysisMeta


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    ready: bool
    modelVersion: str | None
    availableModels: dict[ModelLanguage, str]


class ModelInfoResponse(BaseModel):
    language: ModelLanguage
    modelVersion: str
    modelName: str
    trainedAt: str
    maxTextLength: int
    evaluation: dict[str, object]
    limitations: list[str]
