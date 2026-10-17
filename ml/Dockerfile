FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RUFACT_ENV=production \
    RUFACT_MODEL_PATH=/app/artifacts/model.joblib \
    RUFACT_EN_MODEL_PATH=/app/artifacts/en/model.joblib \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./

RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev --no-install-project \
    && groupadd --system rufact \
    && useradd --system --gid rufact --home-dir /app --no-create-home rufact

COPY --chown=rufact:rufact src ./src
COPY --chown=rufact:rufact artifacts ./artifacts

RUN uv sync --frozen --no-dev --no-editable

EXPOSE 8000

USER rufact

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.getenv('PORT', '8000')}/health\", timeout=2).read()"]

CMD ["sh", "-c", "exec uvicorn rufact_ml.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-server-header --limit-concurrency ${RUFACT_UVICORN_LIMIT_CONCURRENCY:-16} --backlog ${RUFACT_UVICORN_BACKLOG:-64} --timeout-keep-alive 5"]
