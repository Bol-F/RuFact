import hashlib
import json
import re
from pathlib import Path, PurePosixPath

import pytest

from rufact_ml import model

ML_ROOT = Path(__file__).resolve().parents[1]


def _docker_artifact_paths() -> dict[str, str]:
    dockerfile = (ML_ROOT / "Dockerfile").read_text(encoding="utf-8")
    environment = dockerfile.split("ENV ", 1)[1].split("\n\n", 1)[0]
    return dict(re.findall(r"\b(RUFACT_(?:MODEL|EN_MODEL)_PATH)=(\S+)", environment))


def test_docker_noneditable_install_has_explicit_ru_and_en_artifact_paths() -> None:
    dockerfile = (ML_ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "uv sync --frozen --no-dev --no-editable" in dockerfile
    assert "COPY --chown=rufact:rufact artifacts ./artifacts" in dockerfile
    paths = _docker_artifact_paths()
    assert paths == {
        "RUFACT_MODEL_PATH": "/app/artifacts/model.joblib",
        "RUFACT_EN_MODEL_PATH": "/app/artifacts/en/model.joblib",
    }
    for value in paths.values():
        # /app/artifacts is copied independently of the wheel in site-packages.
        relative = PurePosixPath(value).relative_to("/app")
        artifact = ML_ROOT.joinpath(*relative.parts)
        manifest = json.loads(artifact.with_name("artifact-manifest.json").read_text())
        assert manifest["filename"] == artifact.name
        assert manifest["bytes"] == artifact.stat().st_size
        assert manifest["sha256"] == hashlib.sha256(artifact.read_bytes()).hexdigest()


def test_explicit_image_paths_load_both_models_with_noneditable_package_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A wheel-installed model.py is not beside /app/artifacts. Simulate that layout
    # without claiming an image build or mutating the real environment/package.
    installed_module = Path("/app/.venv/lib/python3.12/site-packages/rufact_ml/model.py")
    installed_artifact_root = installed_module.parents[2] / "artifacts"
    monkeypatch.setattr(model, "DEFAULT_ARTIFACT_PATH", installed_artifact_root / "model.joblib")
    monkeypatch.setattr(
        model, "DEFAULT_ENGLISH_ARTIFACT_PATH", installed_artifact_root / "en" / "model.joblib",
    )
    for variable in (
        "RUFACT_RU_MODEL_PATH", "RUFACT_MODEL_SHA256", "RUFACT_RU_MODEL_SHA256",
        "RUFACT_EN_MODEL_SHA256",
    ):
        monkeypatch.delenv(variable, raising=False)

    for variable, value in _docker_artifact_paths().items():
        relative = PurePosixPath(value).relative_to("/app")
        monkeypatch.setenv(variable, str(ML_ROOT.joinpath(*relative.parts)))

    russian = model.load_model_bundle(language="ru")
    english = model.load_model_bundle(language="en")
    assert russian.language == "ru"
    assert english.language == "en"
    assert russian.version.endswith("ru-v2")
    assert english.version.endswith("en-v2")
