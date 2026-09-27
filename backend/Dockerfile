FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --system --no-create-home pepperbox \
 && mkdir -p /data && chown pepperbox:pepperbox /data
USER pepperbox

# Docker initialise un volume nomme vide depuis le contenu de
# l'image, proprietaire compris : /data reste inscriptible.
VOLUME /data

EXPOSE 8000

# Un seul worker : l'etat de la derniere bascule vit en memoire du processus.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "4", \
     "--access-logfile", "-", "app.main:app"]
