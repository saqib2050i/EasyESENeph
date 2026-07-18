# Nephron — ESENeph study deck. Pure-stdlib Python server, no dependencies.
FROM python:3.12-slim

WORKDIR /app

# App code + the seed deck (copied into the data volume on first run).
COPY server.py merge_engine.py nephrology-study.html data.json ./
COPY assets ./assets

# The deck "database" lives here; mount a host path to persist it.
ENV DATA_PATH=/data/data.json \
    PORT=8973 \
    HOST=0.0.0.0
VOLUME ["/data"]
EXPOSE 8973

# Simple healthcheck against the API.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8973/api/health',timeout=3).status==200 else 1)"

CMD ["python", "server.py"]
