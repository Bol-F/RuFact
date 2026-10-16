# English retraining report — 16 October 2026

## Scope and frozen protocol

The existing official LIAR v1 archive was reused with its recorded SHA-256 and
per-member checksums. No new dataset, provider call, external GPU or paid job
was used. Counts, label mapping and exact-deduplication rules are unchanged:
8,127 training, 1,036 validation and 1,016 test statements; `half-true` excluded.

Before overwriting the English artifact, the v1 model, metrics, manifest and
model card were copied to a unique directory outside the repository. The v1
artifact SHA-256 was
`f9bdc8f6e07e1147e8a12a4519e889d62f0297af744ddaab333254b1ea1d6515`.

The v2 calibration/selection protocol was fixed before its test run:

1. For each fixed base C in `[0.25, 1, 4]`, train five stratified folds using only
   training data. Vocabulary, IDF and classifier are refit independently in every
   fold; each calibration prediction is from a model that did not see that row.
2. Fit a sigmoid calibrator on the 8,127 out-of-fold training predictions and
   labels. Fit each candidate's final base pipeline on all training rows.
3. Choose calibrated macro F1 on all 1,036 validation rows, with the threshold
   fixed at 0.5 and lower C preferred for an exact tie. C=0.25 was selected.
4. Run the previously used official test benchmark once after selection. No
   test-driven hyperparameter, calibrator or threshold changes were made.

The test split was already reported for v1. This repeated public benchmark is
not a newly collected blind test, and it does not measure Tavily/Gemini accuracy.

## Results

| Same 1,016 test statements | v1 | v2 |
| --- | ---: | ---: |
| Accuracy | 63.8780% | 65.0591% |
| Macro F1 | 61.8362% | 63.9398% |
| FAKE precision | 63.5971% | 65.7277% |
| FAKE recall | 79.4964% | 75.5396% |
| REAL recall | 45.0000% | 52.3913% |
| ROC AUC | 0.698287 | 0.698436 |
| Brier score, lower is better | 0.219132 | 0.217787 |
| Log loss, lower is better | 0.627307 | 0.624930 |
| Bootstrap 95% accuracy interval | 61.0236–66.6339% | 62.1063–67.9134% |

Accuracy improved by 1.1811 percentage points in this run, while FAKE recall
declined by 3.9568 percentage points. The intervals overlap; no statistically
significant improvement or real-world truth-detection guarantee is claimed.
The training-selected majority-class baseline is 54.7244% accuracy.

The current artifact is `tfidf-word-char-logreg-en-v2`; checksums and exact metrics
are authoritative in `artifacts/en/artifact-manifest.json` and
`artifacts/en/metrics.json`. `npm run train:ml:en` reproduces the procedure using
the cached/checksum-verified archive, followed by `npm run test:ml`.

## Rights and deployment limitations

LIAR is research-use-only according to the original release README; original
source copyright remains. Retraining does not commercially clear the data.
The statements mostly concern US politics in 2007–2016, not current UK news,
general English claims or Uzbek. Exact overlaps are removed, but paraphrases,
shared speakers and topics may remain. This is a text-pattern classifier, not
a source-verifying truth engine. The service must keep internet evidence ahead
of this statistical signal and distinguish confidence from measured accuracy.
