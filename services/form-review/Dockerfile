FROM node:22-bookworm-slim AS bundle
WORKDIR /src
COPY src/lib/pose ./src/lib/pose
COPY src/lib/usageCost.ts ./src/lib/usageCost.ts
COPY services/form-review/*.ts ./services/form-review/
RUN npx --yes esbuild@0.25.12 services/form-review/index.ts --bundle --platform=node --target=node22 --format=esm --outfile=/review.mjs

FROM python:3.12-slim-bookworm
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libegl1 libgl1 libgles2 libglib2.0-0 libportaudio2 \
    && rm -rf /var/lib/apt/lists/*
COPY services/form-review/requirements.txt ./
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt
RUN python -c "from urllib.request import urlretrieve; urlretrieve('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', 'pose_landmarker.task')" \
    && echo "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a  pose_landmarker.task" | sha256sum -c - \
    && python -c "import mediapipe as mp; mp.tasks.vision.PoseLandmarker.create_from_model_path('pose_landmarker.task').close()"
COPY --from=bundle /usr/local/bin/node /usr/local/bin/node
COPY --from=bundle /review.mjs ./
COPY services/form-review/pose_frames.py ./
RUN useradd --system --no-create-home --uid 10001 app
ENV FORM_REVIEW_MODEL_PATH=/app/pose_landmarker.task
USER app
EXPOSE 8080
CMD ["node", "review.mjs"]
