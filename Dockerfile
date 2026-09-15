FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM python:3.13-slim AS application
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=false \
    PORT=8000
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY --from=frontend /app/dist ./dist
RUN python backend/manage.py collectstatic --noinput
EXPOSE 8000
CMD ["gunicorn", "--chdir", "backend", "vawe_backend.wsgi:application", "--bind", "0.0.0.0:8000"]
