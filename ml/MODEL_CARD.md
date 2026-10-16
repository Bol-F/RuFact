# Model card: RuFact Word + Character TF-IDF Logistic Regression RU v2

## Intended use

This model is an educational first-pass classifier for Russian text. It may flag
language that resembles labelled misinformation examples. It must not be used as an
automatic accusation, moderation verdict, legal determination, or substitute for
source-based fact-checking.

## Model

- Model ID: `tfidf-word-char-logreg-ru-v2`
- Features: lowercase word TF-IDF (1–2 word n-grams, up to 60,000 features) plus
  character TF-IDF (3–5 character n-grams, up to 100,000 features)
- Classifier: balanced logistic regression
- Calibration: sigmoid mapping over the base-model log-odds
- Maximum evaluated input: 5,000 characters
- Classes: `REAL`, `FAKE`

The model emits local word/phrase contributions. These explain the linear
classifier's decision, not the truth or falsity of the highlighted phrase.

## Data

The core training and calibration data comes from KazFakeCorpus, pinned to Git commit
`bd9bdd36d1171f0031cc448c808ebee6ecacd6d0` and released under CC BY 4.0. The
training set also includes the checksum-pinned Panorama satire collection and a
deterministic Lenta news sample from Taiga, which is available for personal and
research use.

- Main Russian subset: 2,106 rows before normalization; 2,039 unique texts after
  truncation-aware exact deduplication (986 REAL, 1,053 FAKE).
- Auxiliary Taiga subset: 834 unique satire texts labelled FAKE.
- Auxiliary Taiga REAL subset: 834 unique Lenta articles selected deterministically.
- Combined training set: 3,707 texts (1,820 REAL, 1,887 FAKE).
- External Russian subset: 157 unique texts (76 REAL, 81 FAKE).

The main REAL texts are official/news publications and the main FAKE examples are
primarily synthetic. The auxiliary pair contrasts satire with Lenta reporting, so it
still teaches genre and source cues as well as veracity-related wording. The external
set contains authentic fact-checked misinformation and real news from
Kazakhstan-based sources, but its class labels are fully confounded with source, so
the headline metric can still overestimate generalization.

Dataset authors: Zhanar Lamasheva, Anargul Nekessova, Mansiya Kantureyeva,
Madina Sambetbayeva, Mira Kaldarova, and Aksaule Nazymkhan. See the accompanying
[paper](https://doi.org/10.3390/bdcc10060183) and
[dataset repository](https://github.com/Anargul-Aimuratovna/news-veracity-corpus).

## Evaluation

The generated `artifacts/metrics.json` is authoritative. It records:

1. grouped five-fold cross-validation on the main set, keeping paired REAL/FAKE
   source IDs in the same fold and merging pair IDs connected by duplicate texts
   (986 connected groups across 1,053 nominal pair IDs);
2. nested five-fold out-of-fold evaluation on the separate authentic external set;
3. calibration metrics, a confusion matrix, and bootstrap confidence intervals.

The external score is the headline quality estimate. Internal performance is known
to be inflated by the synthetic/satire-vs-official construction of the training data.
Version 2 scores 80.89% accuracy and 80.88% macro F1 on the 157-text external OOF
evaluation, with a bootstrap 95% accuracy interval of 74.52–86.62%.

The external set has also been used in historical baseline comparisons. Nested
calibration prevents each outer label from fitting that fold's calibrator, but does
not turn this reused set into a new, untouched release test. Its score must not be
described as production factual accuracy or as end-to-end Tavily/Gemini accuracy.

## Reproducible retraining: 2026-10-17

The Russian model was retrained from the same checksum-pinned cached corpora and
predeclared feature/classifier/calibration settings. No new examples or larger
dataset were silently added, and no parameter was selected using this run's outer
evaluation results. The generated metadata includes ordered normalized-input
SHA-256 fingerprints, the seed and package versions.

Training integrity checks now reject conflicting labels and malformed external
evaluation rows. Duplicate-connected paired source groups remain together during
internal cross-validation. Lenta selection uses bounded 200-row SQL batches rather
than one SQL query per article; its selected 834 texts and their order were checked
against the previous implementation and are identical. Database handles are closed
explicitly. These are reproducibility, leakage-control and efficiency improvements,
not a claim that repeating training creates new factual knowledge.

Training-data rights remain unchanged: the Taiga auxiliary sources are limited to
personal/research use. Review the source permissions before a commercial release;
retraining does not grant new data rights.

The complete before/after audit is in
[`RUSSIAN_RETRAINING_2026_10_17.md`](RUSSIAN_RETRAINING_2026_10_17.md).

## Known risks

- strong domain and source shift outside Kazakhstan-focused news;
- missed subtle falsehoods written in neutral language;
- false positives on legitimate warnings, forecasts, or emotionally worded reports;
- adversarial paraphrasing and new topics can bypass learned wording patterns;
- probabilities may be miscalibrated after distribution shift;
- binary labels oversimplify satire, opinion, partially true, and unverifiable claims.
