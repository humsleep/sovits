"""Qwen3-TTS(MLX) 합성 워커. app/engine 이 별도 프로세스로 띄워 stdin/stdout 으로 대화한다.

.venv-mlx 의 파이썬으로 실행:  .venv-mlx/bin/python qwen_worker.py
입력 (stdin, 한 줄 JSON):
  {"cmd": "synth", "id": "...", "sentences": [...], "ref": "/abs/ref.wav", "ref_text": "...",
   "seed": 42, "speed": 1.0}
  {"cmd": "stop"}            진행 중인 합성 중단
출력 (stdout, 한 줄 JSON):
  {"type": "ready", "sr": 24000}
  {"type": "chunk", "id": ..., "pcm": "<base64 int16 mono>"}
  {"type": "done", "id": ...} / {"type": "stopped", "id": ...} / {"type": "error", "id": ..., "msg": ...}
"""
import base64
import json
import os
import queue
import sys
import threading

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"  # Apache-2.0
SR = 24000
GAP_S = 0.25  # 문장 사이 쉼

_out = sys.stdout
sys.stdout = sys.stderr  # 라이브러리 출력이 프로토콜을 깨지 않도록
_out_lock = threading.Lock()


def send(obj):
    with _out_lock:
        _out.write(json.dumps(obj, ensure_ascii=False) + "\n")
        _out.flush()


def pcm(a):
    import numpy as np
    a = np.clip(np.asarray(a, dtype=np.float32).reshape(-1), -1.0, 1.0)
    return base64.b64encode((a * 32767).astype("<i2").tobytes()).decode()


def main():
    import mlx.core as mx
    import numpy as np
    from mlx_audio.tts.utils import load_model

    mx.set_cache_limit(512 * 1024 ** 2)  # 최대 메모리 ~5.5GB 로 유지
    model = load_model(MODEL_ID)
    send({"type": "ready", "sr": SR})

    jobs = queue.Queue()
    stop = threading.Event()

    def reader():
        for line in sys.stdin:
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("cmd") == "stop":
                stop.set()
            elif msg.get("cmd") == "synth":
                jobs.put(msg)
        os._exit(0)  # 부모가 닫으면 종료

    threading.Thread(target=reader, daemon=True).start()

    while True:
        job = jobs.get()
        stop.clear()
        jid = job.get("id")
        speed = float(job.get("speed") or 1.0)
        try:
            for k, sent in enumerate(job["sentences"]):
                if stop.is_set():
                    break
                mx.random.seed(int(job.get("seed", 42)) & 0x7FFFFFFF)
                parts = []
                for r in model.generate(text=sent, ref_audio=job["ref"], ref_text=job["ref_text"],
                                        lang_code="korean", stream=True, streaming_interval=1.5):
                    if stop.is_set():
                        break
                    a = np.asarray(r.audio, dtype=np.float32).reshape(-1)
                    if abs(speed - 1.0) < 1e-3:
                        send({"type": "chunk", "id": jid, "pcm": pcm(a)})
                    else:
                        parts.append(a)
                if parts and not stop.is_set():  # 속도 조절은 문장 단위로 (음높이 유지)
                    import librosa
                    a = librosa.effects.time_stretch(np.concatenate(parts), rate=speed)
                    send({"type": "chunk", "id": jid, "pcm": pcm(a)})
                if k < len(job["sentences"]) - 1 and not stop.is_set():
                    send({"type": "chunk", "id": jid, "pcm": pcm(np.zeros(int(GAP_S * SR / speed)))})
            send({"type": "stopped" if stop.is_set() else "done", "id": jid})
        except Exception as e:  # noqa: BLE001
            send({"type": "error", "id": jid, "msg": f"{type(e).__name__}: {e}"})
        finally:
            mx.clear_cache()


if __name__ == "__main__":
    main()
