# English model card: RuFact English LIAR baseline v1

## Status and intended use

`tfidf-word-char-logreg-en-v1` is a **research-demo text-pattern classifier**.
It is not an autonomous fact-checker or a moderation/accusation system. Internet
evidence takes precedence over this statistical signal in the web result and report.
The Russian model is unchanged; Uzbek does not have a trained statistical model.

## Data and rights

- Source: [LIAR v1.0, William Yang Wang (ACL 2017)](https://aclanthology.org/P17-2067/).
- Official release: <https://sites.cs.ucsb.edu/~william/data/liar_dataset.zip>.
- Archive SHA-256: `611c1addad919743dde15822b87a60bfb760d8f85597f25289e34621800654c7`.
- Original rows: 10,269 train / 1,284 validation / 1,283 test.
- REAL: `true`, `mostly-true`; FAKE: `false`, `barely-true`, `pants-fire`.
- `half-true` is excluded, not silently labelled true or false.
- Final training: 8,127 statements; validation: 1,036; test: 1,016.
- Only the statement text is used. Speaker, political party, history counts,
  fact-checker context and row IDs are excluded from the feature pipeline.
- The original README restricts use to research purposes, and copyright remains
  with the original sources. This is **not commercially cleared**. Raw data stays
  in ignored `ml/data/raw/`; obtain permission or replace the data before commercial use.

## Leakage control and protocol

Normalization is NFKC, whitespace collapsing, 5,000-character truncation and
casefolding for duplicate keys. Test statements take priority over validation,
which takes priority over training. Training loses nine held-out overlap rows,
eight within-training duplicates and two conflicting-label rows. The retained
normalized split contents have zero exact overlap. Near duplicates, shared topics
and shared speakers may remain; the official split is not temporal or speaker-disjoint.

The model is word TF-IDF (1–2 grams, up to 40,000 features) plus character TF-IDF
(3–5 grams, up to 60,000), balanced logistic regression and a sigmoid calibrator.
Three C values (0.25, 1, 4) are compared on one stratified half of validation.
C=1 is selected by macro F1; calibration fits the other 518 validation examples.
The probability threshold is fixed at 0.5. Test labels are never used for training,
selection, calibration or threshold tuning. Seed: `20261012`.

## Held-out results

The authoritative record is [`artifacts/en/metrics.json`](artifacts/en/metrics.json).

| Metric | Value |
| --- | ---: |
| Test claims | 1,016 |
| Accuracy | 63.878% |
| Macro F1 | 61.836% |
| FAKE precision | 63.597% |
| FAKE recall | 79.496% |
| ROC AUC | 69.829% |
| Brier score | 0.2191 |
| Majority-class accuracy | 54.724% |
| Bootstrap 95% accuracy interval | 61.024–66.634% |

Confusion matrix, rows actual / columns predicted `[REAL, FAKE]`:
`[[207, 253], [114, 442]]`. The model misses 114 labelled FAKE claims and falsely
flags 253 REAL claims. Sigmoid calibration changes the decision balance; raw model
metrics are separately recorded (64.370% accuracy, 64.210% macro F1). This comparison
is diagnostic, not test-driven model selection.

## Limitations

LIAR mainly covers US politics from 2007–2016, not current UK news, medical claims,
full articles or every English domain. Confidence is not service accuracy or a
probability that a fact is true. A false claim can have ordinary wording, and a true
claim can resemble the training FAKE class. This baseline is not reliable enough
to replace retrieval and source-based verification. The quality of the combined
Tavily/Gemini/ML pipeline has not been measured on this test set.

## Reproduce and serve

```bash
npm run train:ml:en
npm run test:ml
```

Training writes a separate `artifacts/en/model.joblib`, metrics and checksum manifest;
it never overwrites the Russian artifact. The API auto-routes supported input text
independently of the UI language. `POST /predict` accepts optional `language`
(`auto`, `ru`, `en`, `uz`); unsupported/ambiguous text and explicit mismatches return
422. `GET /model-info?language=en` exposes this evaluation. The existing Docker build
copies both artifact directories; no new provider key or GPU is needed.
