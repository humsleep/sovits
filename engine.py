"""GPT-SoVITS 를 M2 Air 용 설정으로 감싼 공용 엔진 (speak.py, app.py 가 함께 사용).

- 모델: v2Pro, CPU 4스레드 (실측상 가장 빠르고 품질 동등 이상)
- 한국어에선 쓰이지 않는 중국어 BERT 를 로드하지 않음 (메모리 절약)
- 화자 임베딩을 참조 음성별로 1회만 계산 (합성 ~25% 단축, 결과 동일)
- 숫자 정확도를 높인 샘플링 (top_k 5, temperature 0.6), 숫자·영어는 ko_normalize 로 한글화
"""
import gc
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unicodedata

import ko_normalize

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "GPT-SoVITS")
VOICES = os.path.join(ROOT, "voices")
PRESETS = os.path.join(ROOT, "presets")
SETTINGS = os.path.join(ROOT, "settings.json")
MLX_PY = os.path.join(ROOT, ".venv-mlx", "bin", "python")
PRON_DICT = os.path.join(ROOT, "pron_dict.txt")
DEFAULT_VOICE = "기본"
REF_MIN, REF_MAX = 3.0, 10.0
SPEED_MIN, SPEED_MAX = 0.5, 2.0

DEFAULTS = dict(version="v2Pro", device="cpu", threads=4, top_k=5, temperature=0.6, seed=42)


class UserError(Exception):
    """사용자에게 그대로 보여줄 한국어 오류."""


def _atomic_write(path, data):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(data)
    os.replace(tmp, path)


# ---------------------------------------------------------------- 텍스트

def load_pron_dict():
    pairs = []
    if os.path.isfile(PRON_DICT):
        with open(PRON_DICT, encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n")
                if not line.strip() or line.lstrip().startswith("#") or "\t" not in line:
                    continue
                src, dst = (x.strip() for x in line.split("\t", 1))
                if src and dst:
                    pairs.append((src, dst))
    return pairs


def _clean_cell(v):
    if v is None:
        return ""
    s = str(v)
    return "" if s.lower() in ("none", "nan") else re.sub(r"[\t\r\n]+", " ", s).strip()


def save_pron_dict(pairs):
    rows = [(_clean_cell(s), _clean_cell(d)) for s, d in pairs]
    lines = ["# 원문<TAB>읽는 법  (예: ChatGPT\t챗지피티)"] + [f"{s}\t{d}" for s, d in rows if s and d]
    _atomic_write(PRON_DICT, "\n".join(lines) + "\n")


def normalize(text, english=True):
    return ko_normalize.normalize(text or "", load_pron_dict(), english=english)


def check_text(text):
    if not re.search(r"[0-9A-Za-z가-힣]", text or ""):
        raise UserError("읽을 텍스트가 비어 있습니다.")


# ---------------------------------------------------------------- 목소리(참조 음성)

def voice_dir(name):
    name = unicodedata.normalize("NFC", (name or "").strip())
    if not re.fullmatch(r"[0-9A-Za-z가-힣 _-]{1,40}", name):
        raise UserError("목소리 이름은 한글·영문·숫자·공백·_·- 로 1~40자만 쓸 수 있습니다.")
    return os.path.join(VOICES, name)


PRESET_ORDER = ["child_m", "child_f", "student_m", "student_f", "adult_m", "adult_f", "grandpa", "grandma"]


def list_voices():
    """사용자가 등록한 목소리 이름."""
    if not os.path.isdir(VOICES):
        return []
    return sorted(n for n in os.listdir(VOICES)
                  if os.path.isfile(os.path.join(VOICES, n, "ref.wav")) and os.path.isfile(os.path.join(VOICES, n, "ref.txt")))


def list_presets():
    """기본 제공(합성) 목소리 meta 목록. 이름(label)으로 사용한다."""
    out = []
    if os.path.isdir(PRESETS):
        for pid in os.listdir(PRESETS):
            d = os.path.join(PRESETS, pid)
            try:
                with open(os.path.join(d, "meta.json"), encoding="utf-8") as f:
                    meta = json.load(f)
            except (OSError, ValueError):
                continue
            if os.path.isfile(os.path.join(d, "ref.wav")) and os.path.isfile(os.path.join(d, "ref.txt")) and meta.get("label"):
                out.append({**meta, "id": pid, "dir": d})
    rank = {k: i for i, k in enumerate(PRESET_ORDER)}
    return sorted(out, key=lambda m: (rank.get(m["id"], 99), m["label"]))


def _preset_by_label(name):
    return next((m for m in list_presets() if m["label"] == name), None)


def all_voices():
    return list_voices() + [m["label"] for m in list_presets()]


def _voice_paths(name):
    """(디렉터리, preset meta 또는 None). 사용자 목소리가 같은 이름이면 우선."""
    d = voice_dir(name)
    if os.path.isfile(os.path.join(d, "ref.wav")):
        return d, None
    m = _preset_by_label(name)
    if m:
        return m["dir"], m
    return d, None


def default_voice():
    """기본 목소리: 사용자가 지정한 것 → '기본' → 첫 번째 내 목소리 → 첫 번째 기본 제공 목소리."""
    voices = all_voices()
    try:
        with open(os.path.join(VOICES, ".default"), encoding="utf-8") as f:
            name = f.read().strip()
        if name in voices:
            return name
    except OSError:
        pass
    mine = list_voices()
    if DEFAULT_VOICE in mine:
        return DEFAULT_VOICE
    if mine:
        return mine[0]
    adult_f = next((m["label"] for m in list_presets() if m["id"] == "adult_f"), None)
    return adult_f or (voices or [DEFAULT_VOICE])[0]


def set_default_voice(name):
    voice_dir(name)
    if name not in all_voices():
        raise UserError(f"'{name}' 목소리가 없습니다.")
    os.makedirs(VOICES, mode=0o700, exist_ok=True)
    _atomic_write(os.path.join(VOICES, ".default"), name)


def voice_info(name):
    d, meta = _voice_paths(name)
    wav, txt = os.path.join(d, "ref.wav"), os.path.join(d, "ref.txt")
    with open(txt, encoding="utf-8") as f:
        transcript = f.read().strip()
    info = {"name": name, "transcript": transcript, "seconds": round(audio_duration(wav), 1),
            "updated": int(os.path.getmtime(wav)), "preset": bool(meta)}
    if meta:
        info.update(preset_id=meta["id"], gender=meta.get("gender"), age_group=meta.get("age_group"))
    return info


def get_voice(name):
    d, _ = _voice_paths(name)
    wav, txt = os.path.join(d, "ref.wav"), os.path.join(d, "ref.txt")
    if not (os.path.isfile(wav) and os.path.isfile(txt)):
        raise UserError(f"'{name}' 목소리가 등록되어 있지 않습니다. 먼저 목소리를 등록하세요.")
    with open(txt, encoding="utf-8") as f:
        prompt = f.read().strip()
    if not prompt:
        raise UserError(f"'{name}' 목소리의 대사가 비어 있습니다.")
    return wav, prompt


def audio_duration(path):
    import soundfile as sf
    return sf.info(path).duration


def _ffmpeg():
    exe = shutil.which("ffmpeg") or next((p for p in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg")
                                          if os.path.isfile(p)), None)
    if not exe:
        raise UserError("ffmpeg 가 없습니다. 터미널에서 'brew install ffmpeg' 로 설치하세요.")
    return exe


def register_voice(src_audio, transcript, name=DEFAULT_VOICE):
    """녹음 파일을 32kHz 모노로 변환, 앞뒤 무음 제거, 음량 정규화 후 3~10초면 저장."""
    d = voice_dir(name)
    if _preset_by_label(unicodedata.normalize("NFC", name.strip())):
        raise UserError(f"'{name}'은(는) 기본 제공 목소리 이름이에요. 다른 이름을 써 주세요.")
    if not src_audio or not os.path.isfile(src_audio):
        raise UserError("녹음 파일이 없습니다.")
    transcript = re.sub(r"\s+", " ", transcript or "").strip()
    if not transcript:
        raise UserError("녹음에서 읽은 문장을 입력하세요.")
    trim = "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-45dB:start_silence=0.1"
    os.makedirs(VOICES, mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=VOICES, prefix=".tmp-") as tmp:
        out = os.path.join(tmp, "ref.wav")
        r = subprocess.run(
            [_ffmpeg(), "-loglevel", "error", "-y", "-protocol_whitelist", "file,pipe", "-i", src_audio,
             "-ac", "1", "-ar", "32000", "-af", f"{trim},areverse,{trim},areverse,loudnorm=I=-20:TP=-2", out],
            capture_output=True, text=True)
        if r.returncode != 0 or not os.path.isfile(out):
            raise UserError("녹음 파일을 변환하지 못했습니다. 오디오 파일이 맞는지 확인하세요.")
        dur = audio_duration(out)
        if not REF_MIN <= dur <= REF_MAX:
            raise UserError(f"앞뒤 무음을 뺀 길이가 {dur:.1f}초입니다. 3~10초가 되도록 다시 녹음해 주세요.")
        with open(os.path.join(tmp, "ref.txt"), "w", encoding="utf-8") as f:
            f.write(transcript + "\n")
        os.makedirs(d, mode=0o700, exist_ok=True)
        # 대사 → 음성 순서로 교체 (synth 는 음성 파일 변경을 기준으로 캐시를 갱신)
        os.replace(os.path.join(tmp, "ref.txt"), os.path.join(d, "ref.txt"))
        os.replace(out, os.path.join(d, "ref.wav"))
    return dur


def delete_voice(name):
    d = voice_dir(name)
    if not os.path.isdir(d) and _preset_by_label(name):
        raise UserError("기본 제공 목소리는 삭제할 수 없어요.")
    if os.path.isdir(d):
        shutil.rmtree(d)
    marker = os.path.join(VOICES, ".default")
    try:
        with open(marker, encoding="utf-8") as f:
            if f.read().strip() == name:
                os.remove(marker)
    except OSError:
        pass


def asr_ready():
    """받아쓰기 모델(faster-whisper small)이 이미 내려받아져 있는지."""
    try:
        from huggingface_hub import try_to_load_from_cache
        return isinstance(try_to_load_from_cache("Systran/faster-whisper-small", "model.bin"), str)
    except Exception:  # noqa: BLE001
        return False


def transcribe(path):
    """업로드한 녹음의 대사를 자동으로 받아쓴다 (faster-whisper small, 처음 한 번 모델 다운로드)."""
    if not path or not os.path.isfile(path):
        raise UserError("먼저 녹음하거나 파일을 올리세요.")
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    try:
        segs, _ = model.transcribe(path, language="ko")
        return "".join(s.text for s in segs).strip()
    finally:
        del model
        gc.collect()


# ---------------------------------------------------------------- 합성 엔진

class SovitsEngine:
    """빠른 모드: GPT-SoVITS v2Pro (CPU)."""
    name = "sovits"

    def __init__(self, **opts):
        self.opts = {**DEFAULTS, **opts}
        self.tts = None
        self.lock = threading.Lock()
        self._ref_sig = None
        self._stop_gen = 0

    @property
    def loaded(self):
        return self.tts is not None

    def load(self):
        """lock 을 잡은 상태에서 호출."""
        if self.tts is not None:
            return
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        os.chdir(REPO)
        for p in (os.path.join(REPO, "GPT_SoVITS"), REPO):
            if p not in sys.path:
                sys.path.insert(0, p)
        import torch
        from TTS_infer_pack.TTS import TTS, TTS_Config

        torch.set_num_threads(self.opts["threads"])
        TTS.init_bert_weights = lambda self, path: None  # BERT 는 중국어(zh) 전용. text_lang 은 항상 ko

        base = TTS_Config.default_configs[self.opts["version"]]
        cfg = TTS_Config({"custom": {**base, "device": self.opts["device"], "is_half": False}})
        cfg.configs_path = os.path.join(ROOT, ".tts_infer.yaml")  # 저장소 설정 파일을 덮어쓰지 않게
        tts = TTS(cfg)

        if getattr(tts, "sv_model", None) is not None:  # 화자 임베딩 캐시
            orig, cache = tts.sv_model.compute_embedding3, {}

            def cached(audio):
                key = hashlib.sha1(audio.detach().cpu().numpy().tobytes()).hexdigest()
                if key not in cache:
                    if len(cache) >= 4:
                        cache.clear()
                    cache[key] = orig(audio)
                return cache[key]
            tts.sv_model.compute_embedding3 = cached

        import text.english  # noqa: F401  영어 G2P 지연 로딩(수 초)을 미리 처리
        ko_normalize.normalize("AI 1개")  # 정규화기(mecab, cmudict) 미리 로드
        self.tts = tts

    def unload_if(self, should_unload):
        """합성 중이 아니고 조건이 맞으면 모델을 내린다. (idle 감시용)"""
        if not self.lock.acquire(blocking=False):
            return False
        try:
            if self.tts is None or not should_unload():
                return False
            self.tts, self._ref_sig = None, None
            gc.collect()
            return True
        finally:
            self.lock.release()

    def stop(self):
        """진행 중인 합성과, 이미 대기 중인 요청을 모두 취소."""
        self._stop_gen += 1
        tts = self.tts
        if tts is not None:
            tts.stop()

    def synth(self, text, voice=None, speed=1.0, seed=None):
        """(sample_rate, int16 numpy) 반환."""
        import numpy as np
        voice = voice or default_voice()
        check_text(text)
        text = normalize(text)
        check_text(text)
        if not SPEED_MIN <= float(speed) <= SPEED_MAX:
            raise UserError(f"속도는 {SPEED_MIN}~{SPEED_MAX} 사이여야 합니다.")
        ref, prompt = get_voice(voice)
        dur = audio_duration(ref)
        if not REF_MIN <= dur <= REF_MAX:
            raise UserError(f"참조 음성은 3~10초여야 합니다 (현재 {dur:.1f}초). 다시 등록해 주세요.")
        prompt = normalize(prompt)

        gen = self._stop_gen
        with self.lock:
            if self._stop_gen != gen:
                raise UserError("중단되었습니다.")
            self.load()
            tts = self.tts
            st = os.stat(ref)
            sig = (ref, st.st_mtime_ns, st.st_size)
            if sig != self._ref_sig:
                # 같은 경로를 다시 녹음한 경우에도 새 목소리를 쓰고, 첫 합성부터 seed 재현성이 맞도록 미리 로드
                tts.set_ref_audio(ref)
                self._ref_sig = sig
            if self._stop_gen != gen:
                raise UserError("중단되었습니다.")

            srs, audio = set(), []
            for sr, chunk in tts.run({
                "text": text,
                "text_lang": "ko",
                "ref_audio_path": ref,
                "prompt_text": prompt,
                "prompt_lang": "ko",
                "text_split_method": "cut5",
                "batch_size": 1,
                "speed_factor": float(speed),
                "top_k": self.opts["top_k"],
                "temperature": self.opts["temperature"],
                "seed": self.opts["seed"] if seed is None else int(seed),
            }):
                srs.add(sr)
                audio.append(chunk)
            sampling_rate = tts.configs.sampling_rate

        if self._stop_gen != gen:
            raise UserError("중단되었습니다.")
        if not audio or srs != {sampling_rate}:
            raise UserError("합성에 실패했습니다. 텍스트를 바꿔서 다시 시도해 주세요.")
        wav = np.concatenate(audio)
        if not np.any(wav):
            raise UserError("합성 결과가 무음입니다.")
        return sampling_rate, wav


class QwenEngine:
    """고품질 모드: Qwen3-TTS 1.7B (MLX). 별도 프로세스(qwen_worker.py)에서 실행해 메모리를 깔끔히 비울 수 있다."""
    name = "qwen"
    SR = 24000

    def __init__(self):
        self.proc = None
        self.lock = threading.Lock()
        self._stdin_lock = threading.Lock()
        self._stop_gen = 0
        self._job = 0

    @property
    def loaded(self):
        return self.proc is not None and self.proc.poll() is None

    def load(self):
        """lock 을 잡은 상태에서 호출."""
        if self.loaded:
            return
        if not os.path.isfile(MLX_PY):
            raise UserError("고품질 엔진(.venv-mlx)이 설치되어 있지 않습니다.")
        self.proc = subprocess.Popen(
            [MLX_PY, os.path.join(ROOT, "qwen_worker.py")], cwd=ROOT, text=True, bufsize=1,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={**os.environ, "HF_HUB_OFFLINE": "1", "TOKENIZERS_PARALLELISM": "false"})
        msg = self._read()
        if msg.get("type") != "ready":
            self._kill()
            raise UserError("고품질 엔진을 시작하지 못했습니다.")

    def _read(self):
        line = self.proc.stdout.readline()
        if not line:
            self._kill()
            raise UserError("고품질 엔진이 예기치 않게 종료되었습니다. 다시 시도해 주세요.")
        return json.loads(line)

    def _send(self, obj):
        with self._stdin_lock:
            if self.loaded:
                self.proc.stdin.write(json.dumps(obj, ensure_ascii=False) + "\n")
                self.proc.stdin.flush()

    def _kill(self):
        p, self.proc = self.proc, None
        if p and p.poll() is None:
            p.kill()
            p.wait(timeout=5)

    def unload_if(self, should_unload):
        if not self.lock.acquire(blocking=False):
            return False
        try:
            if not self.loaded or not should_unload():
                return False
            self._kill()
            return True
        finally:
            self.lock.release()

    def unload(self):
        with self.lock:
            self._kill()

    def stop(self):
        self._stop_gen += 1
        try:
            self._send({"cmd": "stop"})
        except (OSError, ValueError):
            pass

    def synth_stream(self, sentences, ref, prompt, speed=1.0, seed=None, gen=None):
        """(sr, int16 numpy 조각)을 생성되는 대로 내보낸다."""
        with self.lock:
            if gen is not None and self._stop_gen != gen:
                raise UserError("중단되었습니다.")
            self.load()
            self._job += 1
            jid = str(self._job)
            self._send({"cmd": "synth", "id": jid, "sentences": sentences, "ref": ref, "ref_text": prompt,
                        "seed": 42 if seed is None else int(seed), "speed": float(speed)})
            state = {"ended": False}
            try:
                yield from self._collect(jid, state)
            finally:
                if not state["ended"] and self.loaded:  # 중간에 끊긴 경우(클라이언트 연결 종료 등) 워커도 멈춘다
                    self._send({"cmd": "stop"})
                    self._drain(jid)

    def _drain(self, jid):
        try:
            while True:
                msg = self._read()
                if msg.get("id") == jid and msg.get("type") in ("done", "stopped", "error"):
                    return
        except UserError:
            return

    def _collect(self, jid, state):
        import base64
        import numpy as np
        while True:
            msg = self._read()
            if msg.get("id") != jid:
                continue
            t = msg.get("type")
            if t == "chunk":
                yield self.SR, np.frombuffer(base64.b64decode(msg["pcm"]), dtype="<i2")
                continue
            state["ended"] = True
            if t == "done":
                return
            if t == "stopped":
                raise UserError("중단되었습니다.")
            raise UserError("합성에 실패했습니다: " + str(msg.get("msg", ""))[:200])


def load_settings():
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            s = json.load(f)
    except (OSError, ValueError):
        s = {}
    return {"engine": "qwen" if os.path.isfile(MLX_PY) else "sovits", **s}


def save_settings(**kw):
    s = {**load_settings(), **kw}
    _atomic_write(SETTINGS, json.dumps(s, ensure_ascii=False, indent=2))
    return s


class Engine:
    """설정에 따라 고품질(Qwen3) 또는 빠른(GPT-SoVITS) 엔진으로 합성. 한 번에 하나만 메모리에 올린다."""
    ENGINES = {"qwen": "고품질", "sovits": "빠른 모드"}

    def __init__(self, engine=None):
        self.backends = {"qwen": QwenEngine(), "sovits": SovitsEngine()}
        self.current = engine or load_settings()["engine"]
        self._stop_gen = 0

    @property
    def backend(self):
        return self.backends[self.current]

    @property
    def loaded(self):
        return self.backend.loaded

    @property
    def lock(self):
        return self.backend.lock

    def busy(self):
        return any(b.lock.locked() for b in self.backends.values())

    def set_engine(self, name):
        if name not in self.backends:
            raise UserError("알 수 없는 엔진입니다.")
        if name == "qwen" and not os.path.isfile(MLX_PY):
            raise UserError("고품질 엔진(.venv-mlx)이 설치되어 있지 않습니다.")
        if name != self.current:
            old = self.backends[self.current]
            self.current = name
            save_settings(engine=name)
            old.stop()
            if isinstance(old, QwenEngine):
                old.unload()
            else:
                old.unload_if(lambda: True)
        return name

    def load(self):
        """lock 을 잡은 상태에서 호출."""
        self.backend.load()

    def unload_if(self, should_unload):
        return self.backend.unload_if(should_unload)

    def stop(self):
        self._stop_gen += 1
        for b in self.backends.values():
            b.stop()

    def prepare(self, text, voice, speed):
        check_text(text)
        if not SPEED_MIN <= float(speed) <= SPEED_MAX:
            raise UserError(f"속도는 {SPEED_MIN}~{SPEED_MAX} 사이여야 합니다.")
        voice = voice or default_voice()
        ref, prompt = get_voice(voice)
        dur = audio_duration(ref)
        if not REF_MIN <= dur <= REF_MAX:
            raise UserError(f"참조 음성은 3~10초여야 합니다 (현재 {dur:.1f}초). 다시 등록해 주세요.")
        return voice, ref, prompt

    def synth_stream(self, text, voice=None, speed=1.0, seed=None):
        """(sr, int16 조각)을 차례로 내보낸다. 빠른 모드는 한 번에 전체를 내보낸다."""
        gen = self._stop_gen
        # 백엔드는 자기 카운터로 중단 여부를 판단한다. 엔진 전환(set_engine)은 이전 백엔드의 카운터만 올리므로
        # Engine 의 카운터를 넘기면 둘이 어긋나 이후 모든 요청이 '중단되었습니다'로 거절된다.
        backend_gen = self.backend._stop_gen
        voice, ref, prompt = self.prepare(text, voice, speed)
        if self.current == "sovits":
            yield self.backend.synth(text, voice=voice, speed=speed, seed=seed)
            return
        sents = ko_normalize.split_sentences(normalize(text, english=False))
        if not sents:
            raise UserError("읽을 텍스트가 비어 있습니다.")
        n = 0
        for sr, chunk in self.backend.synth_stream(sents, ref, prompt, speed, seed, backend_gen):
            if self._stop_gen != gen:
                raise UserError("중단되었습니다.")
            n += len(chunk)
            yield sr, chunk
        if not n:
            raise UserError("합성 결과가 무음입니다.")

    def synth(self, text, voice=None, speed=1.0, seed=None):
        import numpy as np
        sr, parts = None, []
        for sr, chunk in self.synth_stream(text, voice, speed, seed):
            parts.append(chunk)
        wav = np.concatenate(parts)
        if not np.any(wav):
            raise UserError("합성 결과가 무음입니다.")
        return sr, wav


def wav_bytes(sr, wav):
    import io
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def write_wav(path, sr, wav):
    import soundfile as sf
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sf.write(path, wav, sr)


def history_append(entry):
    hist = os.path.join(ROOT, "out", "history")
    os.makedirs(hist, mode=0o700, exist_ok=True)
    with open(os.path.join(hist, "index.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
