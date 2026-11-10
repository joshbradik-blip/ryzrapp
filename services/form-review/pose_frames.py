"""Read a bounded local clip and emit the RYZR pose frame JSON contract."""

import json
import math
import os
import sys
from pathlib import Path

import av
import mediapipe as mp
import numpy as np


MIN_SECONDS = 2
MAX_SECONDS = 20
SAMPLE_FPS = 15
MAX_INPUT_PIXELS = 9_000_000
MAX_INPUT_SIDE = 4096
MAX_DECODED_FRAMES = 2400
MAX_INFERENCE_SIDE = 768
DURATION_CUE = "Use a clip between 2 and 20 seconds long."
FORMAT_CUE = "This clip could not be read. Try recording or choosing an MP4 or MOV."
SIZE_CUE = "This video resolution is too large. Try recording at 1080p or 720p."

# MediaPipe's 33 BlazePose joints, mapped to RYZR's JointName vocabulary.
JOINTS = {
    0: "nose",
    2: "left_eye",
    5: "right_eye",
    7: "left_ear",
    8: "right_ear",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
    29: "left_heel",
    30: "right_heel",
    31: "left_foot_index",
    32: "right_foot_index",
}


class Retake(Exception):
    """The clip cannot be used for a form review."""


def check_size(width, height):
    if not width or not height or max(width, height) > MAX_INPUT_SIDE or width * height > MAX_INPUT_PIXELS:
        raise Retake(SIZE_CUE)


def upright_rgb(frame):
    scale = min(1, MAX_INFERENCE_SIDE / max(frame.width, frame.height))
    rgb = frame.to_ndarray(
        width=max(1, round(frame.width * scale)),
        height=max(1, round(frame.height * scale)),
        format="rgb24",
    )
    # PyAV exposes the phone's display rotation counterclockwise, like rot90.
    if frame.rotation % 90:
        raise Retake("Try recording with the phone upright or sideways.")
    return np.ascontiguousarray(np.rot90(rgb, frame.rotation // 90))


def sampled_frames(path):
    # Restrict to local MP4/MOV and disable QuickTime external data references.
    # Other container types, such as playlists, are never auto-detected.
    options = {"enable_drefs": "0", "use_absolute_path": "0", "protocol_whitelist": "file"}
    try:
        with av.open(str(path), format="mov", options=options) as container:
            stream = next(
                (video for video in container.streams.video if not video.disposition & av.stream.Disposition.attached_pic),
                None,
            )
            if stream is None:
                raise Retake(FORMAT_CUE)

            check_size(stream.width, stream.height)
            if stream.duration is not None and stream.time_base is not None:
                duration = stream.duration * stream.time_base
                if not MIN_SECONDS <= duration <= MAX_SECONDS:
                    raise Retake(DURATION_CUE)

            stream.codec_context.options = {"max_pixels": str(MAX_INPUT_PIXELS)}
            stream.codec_context.thread_count = 2
            start = None
            end = 0
            previous = None
            last_bucket = -1
            last_sample_ms = -1

            # Only decode the chosen video stream. Audio is neither read into
            # the model nor copied anywhere.
            for count, frame in enumerate(container.decode(stream), start=1):
                if count > MAX_DECODED_FRAMES:
                    raise Retake("Try recording the clip in standard video mode instead of high-speed video.")
                check_size(frame.width, frame.height)
                if frame.is_corrupt:
                    raise Retake(FORMAT_CUE)
                if frame.pts is None or frame.time_base is None:
                    continue

                pts = frame.pts * frame.time_base
                if start is None:
                    start = pts
                elapsed = pts - start
                if previous is not None and elapsed <= previous:
                    continue
                frame_duration = frame.duration * frame.time_base if frame.duration else 0
                if not frame_duration and previous is not None:
                    frame_duration = elapsed - previous
                end = max(end, elapsed + frame_duration)
                previous = elapsed
                if end > MAX_SECONDS:
                    raise Retake(DURATION_CUE)

                bucket = int(elapsed * SAMPLE_FPS)
                milliseconds = round(elapsed * 1000)
                if bucket <= last_bucket or milliseconds <= last_sample_ms:
                    continue
                last_bucket = bucket
                last_sample_ms = milliseconds
                yield milliseconds, upright_rgb(frame)

            if not MIN_SECONDS <= end <= MAX_SECONDS:
                raise Retake(DURATION_CUE)
    except av.error.FFmpegError as error:
        raise Retake(FORMAT_CUE) from error


def convert_landmarks(pose, aspect):
    landmarks = {}
    for index, name in JOINTS.items():
        joint = pose[index]
        x = joint.x * aspect
        y = joint.y
        score = min(value for value in (joint.visibility, joint.presence, 1.0) if value is not None)
        if math.isfinite(x) and math.isfinite(y) and math.isfinite(score):
            landmarks[name] = {"x": round(x, 5), "y": round(y, 5), "score": round(max(0, score), 4)}
    return landmarks


def extract(path, model_path):
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path), delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_poses=2,
    )
    frames = []
    multi_person_frames = 0
    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as landmarker:
        for timestamp_ms, rgb in sampled_frames(path):
            aspect = rgb.shape[1] / rgb.shape[0]
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            poses = landmarker.detect_for_video(image, timestamp_ms).pose_landmarks
            if len(poses) > 1:
                multi_person_frames += 1
            # Do not let a nearby person's joints become part of this set.
            landmarks = convert_landmarks(poses[0], aspect) if len(poses) == 1 else {}
            channels = rgb[::16, ::16].mean(axis=(0, 1))
            brightness = np.dot(channels, [0.2126, 0.7152, 0.0722]) / 255
            frames.append({
                "t": timestamp_ms,
                "xMax": round(aspect, 5),
                "brightness": round(float(brightness), 4),
                "landmarks": landmarks,
            })

    if multi_person_frames >= max(3, len(frames) / 5):
        raise Retake("Try again with only you visible in the frame.")
    return {"status": "ok", "frames": frames}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python pose_frames.py <local video file>")
    model_path = os.environ.get("FORM_REVIEW_MODEL_PATH")
    if not model_path or not Path(model_path).is_file():
        raise SystemExit("FORM_REVIEW_MODEL_PATH must point to a local Pose Landmarker task model.")

    path = Path(sys.argv[1])
    if not path.is_file():
        raise SystemExit("Input clip file not found.")
    try:
        result = extract(path, model_path)
    except Retake as error:
        result = {"status": "retake", "cue": str(error)}
    print(json.dumps(result, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
