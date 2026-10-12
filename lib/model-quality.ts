import evaluationData from "@/ml/artifacts/metrics.json";
import englishEvaluationData from "@/ml/artifacts/en/metrics.json";

export const ENGLISH_MODEL_QUALITY = {
  modelVersion: englishEvaluationData.modelVersion,
  datasetName: englishEvaluationData.dataset.name,
  trainingSamples: englishEvaluationData.dataset.splits.train.samples,
  testSamples: englishEvaluationData.evaluation.heldOutTest.samples,
  metrics: englishEvaluationData.evaluation.heldOutTest.metrics,
  accuracyInterval: englishEvaluationData.evaluation.heldOutTest.confidenceIntervals.accuracy95,
  majorityAccuracy: englishEvaluationData.evaluation.heldOutTest.majorityBaseline.accuracy,
};

export type QualityMetricKey =
  | "accuracy"
  | "macroF1"
  | "precisionFake"
  | "recallFake";

export interface ModelQualityMetric {
  key: QualityMetricKey;
  label: string;
  value: number | null;
  description: string;
}

export interface ModelQuality {
  status: "evaluated";
  modelName: string;
  modelVersion: string;
  evaluatedAt: string;
  dataset: {
    name: string;
    samples: number;
    split: string;
  };
  confidenceInterval: readonly [number, number];
  confusionMatrix: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  metrics: readonly ModelQualityMetric[];
  limitations: readonly string[];
}

const headline = evaluationData.evaluation.externalNestedCrossValidation;

export const MODEL_QUALITY: ModelQuality = {
  status: "evaluated",
  modelName: "TF-IDF слов и символов + логистическая регрессия",
  modelVersion: evaluationData.modelVersion,
  evaluatedAt: evaluationData.generatedAt,
  dataset: {
    name: "KazFakeCorpus · внешняя русская выборка",
    samples: headline.samples,
    split: "Вложенная 5-кратная OOF-оценка",
  },
  confidenceInterval: headline.confidenceIntervals.accuracy95 as [number, number],
  confusionMatrix: headline.metrics.confusionMatrix as [
    [number, number],
    [number, number],
  ],
  metrics: [
    {
      key: "accuracy",
      label: "Accuracy",
      value: headline.metrics.accuracy,
      description: "Доля правильных ответов на внешней выборке",
    },
    {
      key: "macroF1",
      label: "Macro F1",
      value: headline.metrics.macroF1,
      description: "Баланс качества по классам REAL и FAKE",
    },
    {
      key: "precisionFake",
      label: "Precision · FAKE",
      value: headline.metrics.precisionFake,
      description: "Какая доля предупреждений действительно относится к классу FAKE",
    },
    {
      key: "recallFake",
      label: "Recall · FAKE",
      value: headline.metrics.recallFake,
      description: "Какую долю размеченных примеров FAKE удалось обнаружить",
    },
  ],
  limitations: [
    "Модель анализирует статистические языковые признаки, но не проверяет факты в интернете.",
    "Дополнительные данные сопоставляют сатиру Panorama с новостями Lenta, поэтому модель может изучать жанровые признаки.",
    "Внешняя выборка содержит только 157 текстов, а её источники связаны с классами REAL и FAKE.",
    "Оценка отражает казахстанский новостной домен и может заметно снижаться на других темах и источниках.",
  ],
};
