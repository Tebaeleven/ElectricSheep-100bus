FROM python:3.11-slim
WORKDIR /app
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server /app/server
RUN useradd --create-home rail
USER rail
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--ws-max-size", "4096"]
