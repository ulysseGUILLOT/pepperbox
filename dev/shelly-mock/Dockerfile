FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir Flask==3.0.3 tzdata==2024.1
ENV TZ=Europe/Paris
WORKDIR /srv
COPY app.py .
EXPOSE 8000
CMD ["flask", "--app", "app", "run", "--host", "0.0.0.0", "--port", "8000"]
