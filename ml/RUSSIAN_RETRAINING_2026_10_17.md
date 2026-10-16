# Russian retraining audit — 2026-10-17

## Scope and outcome

The existing Russian TF-IDF/logistic-regression model was genuinely retrained on
CPU using the cached, checksum-pinned corpora. The existing baseline artifacts
were backed up outside the repository before replacement. No cloud job, paid
service, additional training examples or synthetic accuracy claim was introduced.
The algorithm and model ID remain `tfidf-word-char-logreg-ru-v2`.

Retraining reproduces the existing external metrics; repeating a fixed training
run does not add factual knowledge. Factual claims still require retrieved
evidence. This report does not measure Tavily/Gemini end-to-end accuracy.

| External nested out-of-fold metric | Before | After |
| --- | ---: | ---: |
| Accuracy | 80.8917% | 80.8917% |
| Macro F1 | 80.8847% | 80.8847% |
| Precision, FAKE | 84.9315% | 84.9315% |
| Recall, FAKE | 76.5432% | 76.5432% |
| Brier score (lower is better) | 0.138155 | 0.138155 |
| Log loss (lower is better) | 0.433156 | 0.433156 |

The confusion matrix remains `[[65, 11], [19, 62]]` with rows/columns ordered
`REAL, FAKE`. The 95% bootstrap accuracy interval is 74.5223–86.6242% on this
particular evaluation set, not a guarantee for arbitrary production text.

## Data, rights and fixed protocol

- Core Russian corpus: 2,039 normalized unique examples from 2,106 raw rows;
  986 REAL and 1,053 FAKE. Sixty-seven exact normalized duplicates are removed.
- Auxiliary corpus: 834 Panorama satire and 834 Lenta news texts.
- Total base-model training data: 3,707 texts, 1,820 REAL and 1,887 FAKE.
- External Russian set: 157 examples, 76 REAL and 81 FAKE.
- KazFakeCorpus revision: `bd9bdd36d1171f0031cc448c808ebee6ecacd6d0`.
- KazFakeCorpus license: CC BY 4.0. Taiga terms: personal/research use. A public
  commercial use requires separate rights review; this retraining grants none.

The predeclared word/character feature settings, balanced logistic regression,
seed `20260929`, and calibration candidate values are unchanged. Calibration
strength is selected inside each outer training fold. No base-model parameter
was selected using this run's outer results. The final production calibrator is
then fitted using the external calibration data as documented in the model card.

This small Kazakhstan-focused external set is source-confounded and was already
used in historical model comparisons. Nested calibration does not make it a fresh
untouched release test. Internal synthetic/official-news accuracy is deliberately
not used as the headline quality claim. A new source-balanced, time-separated,
independently labelled Russian test set is needed before claiming improvement.

## Repairs verified during this retraining

1. Internal CV now merges paired source IDs transitively when duplicate texts
   connect them. The 1,053 nominal paired groups become 986 connected groups;
   every related REAL/FAKE example stays in one fold. The resulting internal
   accuracy remains 99.7548%, but that easy in-domain number is not factual
   accuracy in the real world.
2. Conflicting main-dataset duplicate labels and malformed external labels,
   empty texts or empty source names fail instead of silently contaminating
   training/evaluation.
3. Lenta selection uses bounded 200-ID parameterized queries instead of one query
   per article. The selected 834 texts and their order exactly match the previous
   implementation. SQLite handles are explicitly closed.
4. Generated metrics bind ordered normalized texts and labels to SHA-256
   fingerprints and record the seed, NumPy and scikit-learn versions.
5. Seven focused regression tests cover group propagation, label/input integrity,
   identical deterministic sampling, bounded SQL count, and input fingerprints.

Normalized training SHA-256:
`f68f42d1a663c230a8af4d30695e09ecda8986804c48348f5532050d93b4066a`.

Normalized external SHA-256:
`3cf8e0b8f25b7a4560c4dd8e4ae8ee5cb58e9ffeab2746e4f40e99681a34cc61`.

## Reproduce and inspect

```bash
uv run --project ml rufact-train
uv run --project ml pytest ml/tests/test_russian_training.py -q -p no:cacheprovider
uv run --project ml ruff check ml/src/rufact_ml/training.py ml/tests/test_russian_training.py
```

`artifacts/metrics.json` is authoritative for UTC generation time and metrics.
`artifacts/artifact-manifest.json` contains the regenerated bundle checksum.
Raw data remains ignored and is not added to Git. This task changes no English
artifact, API authentication, deployment credential or payment configuration.
