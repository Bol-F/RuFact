import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import pytest

from rufact_ml import training


@pytest.fixture
def owned_directory():
    # Avoid relying on a pre-existing pytest temp tree's Windows permissions.
    with TemporaryDirectory(prefix="rufact-russian-training-test-") as directory:
        yield Path(directory)


def _main_row(news_id: str, text: str) -> dict:
    return {"data": {"NEWS_ID": news_id, "text": text}}


def test_duplicate_text_merges_paired_source_groups_transitively(owned_directory: Path) -> None:
    rows = [
        _main_row("REAL_RU_NEWS_1", "Shared real source"),
        _main_row("FAKE_RU_NEWS_1", "Shared fake source"),
        _main_row("REAL_RU_NEWS_2", "Shared real source"),
        _main_row("FAKE_RU_NEWS_2", "Another fake source"),
        _main_row("REAL_RU_NEWS_3", "Another real source"),
        _main_row("FAKE_RU_NEWS_3", "Shared fake source"),
        _main_row("REAL_RU_NEWS_4", "Independent real"),
        _main_row("FAKE_RU_NEWS_4", "Independent fake"),
    ]
    path = owned_directory / "main.json"
    path.write_text(json.dumps(rows), encoding="utf-8")
    texts, labels, groups, summary = training.load_main_dataset(path)
    assert len(texts) == len(labels) == len(groups) == 6
    assert groups.tolist() == [1, 1, 1, 1, 4, 4]
    assert summary["exactDuplicatesRemoved"] == 2
    assert summary["pairedGroupsBeforeDuplicateMerging"] == 4
    assert summary["leakageSafeGroups"] == 2


def test_conflicting_duplicate_main_labels_fail_instead_of_silently_dropping(
    owned_directory: Path,
) -> None:
    path = owned_directory / "main.json"
    path.write_text(
        json.dumps([
            _main_row("REAL_RU_NEWS_1", "Same text"),
            _main_row("FAKE_RU_NEWS_2", "Same text"),
        ]),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="conflicting labels"):
        training.load_main_dataset(path)


@pytest.mark.parametrize(
    "replacement",
    [{"Class": "UNKNOWN"}, {"TEXT": "   "}, {"Source": "  "}],
)
def test_external_evaluation_rejects_invalid_labels_or_blank_inputs(
    owned_directory: Path, replacement: dict,
) -> None:
    row = {"Language": "RU", "Class": "REAL", "TEXT": "A real claim", "Source": "News"}
    path = owned_directory / "external.json"
    path.write_text(json.dumps([{**row, **replacement}]), encoding="utf-8")
    with pytest.raises(ValueError):
        training.load_external_dataset(path)


def test_lenta_selection_keeps_hash_order_without_n_plus_one_queries(
    owned_directory: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = owned_directory / "Lenta.db"
    ids = [str(index) for index in range(450)]
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.execute("CREATE TABLE tagged_texts (id TEXT PRIMARY KEY, text TEXT)")
        connection.execute("CREATE TABLE meta (textid TEXT PRIMARY KEY, textname TEXT)")
        connection.executemany(
            "INSERT INTO tagged_texts VALUES (?, ?)",
            [(text_id, f"# text = Article {text_id}") for text_id in ids],
        )
        connection.executemany("INSERT INTO meta VALUES (?, ?)", [(value, "") for value in ids])

    statements: list[str] = []
    original_connect = sqlite3.connect

    def traced_connect(database):
        connection = original_connect(database)
        connection.set_trace_callback(statements.append)
        return connection

    monkeypatch.setattr(training.sqlite3, "connect", traced_connect)
    ranked_ids = sorted(
        ids, key=lambda value: hashlib.sha256(f"{training.SEED}:{value}".encode()).digest(),
    )
    excluded = {f"Article {ranked_ids[0]}"}
    texts, summary = training.load_lenta_dataset(path, excluded, sample_size=401)
    assert texts.tolist() == [f"Article {text_id}" for text_id in ranked_ids[1:402]]
    assert summary["samples"] == 401
    assert len([query for query in statements if query.lstrip().startswith("SELECT")]) == 4


def test_dataset_fingerprint_is_stable_and_binds_labels_and_row_order() -> None:
    texts = np.asarray(["First", "Second"], dtype=object)
    labels = np.asarray([0, 1])
    fingerprint = training.dataset_fingerprint(texts, labels)
    assert len(fingerprint) == 64
    assert training.dataset_fingerprint(texts.copy(), labels.copy()) == fingerprint
    assert training.dataset_fingerprint(texts, labels[::-1]) != fingerprint
    assert training.dataset_fingerprint(texts[::-1], labels[::-1]) != fingerprint
    with pytest.raises(ValueError, match="counts differ"):
        training.dataset_fingerprint(texts, labels[:1])
