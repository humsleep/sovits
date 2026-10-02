"""내 목소리 TTS 웹 앱 (http://127.0.0.1:7860). 모델을 메모리에 유지해 매번의 로딩 대기를 없앤다.

실행: start.command 더블클릭 (또는 ./GPT-SoVITS/.venv/bin/python app.py)
"""
import json
import os
import random
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime

os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"
ROOT = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("GRADIO_TEMP_DIR", os.path.join(ROOT, ".gradio_tmp"))
os.umask(0o077)  # 목소리·기록 파일은 본인만 읽을 수 있게

import gradio as gr  # noqa: E402
import uvicorn  # noqa: E402
from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.concurrency import run_in_threadpool  # noqa: E402
from fastapi.responses import FileResponse, RedirectResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import engine  # noqa: E402

PORT = int(os.environ.get("SOVITS_PORT", "7860"))
APP_ID = "my-voice-tts"
IDLE_UNLOAD_SEC = 20 * 60  # 20분 동안 안 쓰면 모델을 내려 메모리 확보
HISTORY_MAX = 300  # 기록은 최근 300개까지만 보관
HIST = os.path.join(ROOT, "out", "history")
PROMPTS = [line.strip() for line in open(os.path.join(ROOT, "prompts_ko.txt"), encoding="utf-8") if line.strip()]

eng = engine.Engine()
last_used = time.time()
_play_proc = None
_play_lock = threading.Lock()
_hist_lock = threading.Lock()
_jobs = {}  # job id → 기록 파일명 (최근 것만)
_cancelled = set()


def touch():
    global last_used
    last_used = time.time()


def idle_watcher():
    while True:
        time.sleep(60)
        if eng.unload_if(lambda: time.time() - last_used > IDLE_UNLOAD_SEC):
            print("[idle] 모델을 메모리에서 내렸습니다. 다음 요청 때 다시 불러옵니다.")


def warmup():
    touch()
    if not eng.loaded:
        with eng.lock:
            eng.load()
    return "준비 완료 ✅"


# ---------------------------------------------------------------- 기록

def load_history():
    idx = os.path.join(HIST, "index.jsonl")
    rows = []
    if os.path.isfile(idx):
        with open(idx, encoding="utf-8") as f:
            for line in f:
                try:
                    e = json.loads(line)
                    if isinstance(e, dict) and os.path.isfile(os.path.join(HIST, os.path.basename(e["file"]))):
                        rows.append(e)
                except (ValueError, KeyError, TypeError):
                    continue
    return rows[::-1]


def _prune_history():
    rows = load_history()  # 최신순
    if len(rows) <= HISTORY_MAX:
        return
    for e in rows[HISTORY_MAX:]:
        try:
            os.remove(os.path.join(HIST, os.path.basename(e["file"])))
        except OSError:
            pass
    keep = rows[:HISTORY_MAX][::-1]
    tmp = os.path.join(HIST, ".index.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.writelines(json.dumps(e, ensure_ascii=False) + "\n" for e in keep)
    os.replace(tmp, os.path.join(HIST, "index.jsonl"))


def synth_to_history(text, voice, speed, seed=None, save=True):  # noqa: D401
    """합성 → 기록 저장. (경로, 길이초, wav bytes) 반환. save=False 면 기록 없이 (None, 길이, bytes)."""
    touch()
    sr, wav = eng.synth(text, voice=voice, speed=speed, seed=seed)
    touch()
    data = engine.wav_bytes(sr, wav)
    if not save:
        return None, len(wav) / sr, data
    hid, secs = _save_history_wav(text, voice, speed, sr, wav, data, seed=seed)
    return os.path.join(HIST, hid), secs, data


def _save_history_wav(text, voice, speed, sr, wav, data=None, seed=None):
    """기록 폴더에 저장하고 (파일명, 길이초) 반환."""
    data = data or engine.wav_bytes(sr, wav)
    now = datetime.now()
    name = f"{now:%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}.wav"
    with _hist_lock:
        os.makedirs(HIST, mode=0o700, exist_ok=True)
        with open(os.path.join(HIST, name), "wb") as f:
            f.write(data)
        engine.history_append({"file": name, "time": f"{now:%Y-%m-%d %H:%M:%S}", "voice": voice,
                               "speed": speed, "seconds": round(len(wav) / sr, 1), "text": text,
                               "engine": eng.current, "seed": 42 if seed is None else int(seed)})
        _prune_history()
    return name, len(wav) / sr


# ---------------------------------------------------------------- UI 콜백

def _voice_updates(selected=None):
    voices = engine.all_voices()
    v = selected if selected in voices else (engine.DEFAULT_VOICE if engine.DEFAULT_VOICE in voices
                                             else (voices[0] if voices else None))
    return gr.update(choices=voices, value=v), gr.update(choices=voices, value=v)


def ui_preview(text):
    try:
        return engine.normalize(text or "")
    except Exception as e:  # noqa: BLE001
        return f"(미리보기 오류: {e})"


def ui_speak(text, voice, speed, progress=gr.Progress()):
    if not voice:
        raise gr.Error("먼저 '내 목소리 등록' 탭에서 목소리를 등록하세요.")
    progress(0, desc="모델 준비 중..." if not eng.loaded else "합성 중...")
    t = time.time()
    try:
        path, secs, _ = synth_to_history(text, voice, speed)
    except engine.UserError as e:
        raise gr.Error(str(e))
    return path, f"{secs:.1f}초 음성 · {time.time() - t:.1f}초 걸림"


def ui_stop():
    eng.stop()
    return "중지했습니다."


def ui_new_prompt(cur=None):
    return random.choice([p for p in PROMPTS if p != cur] or PROMPTS)


def ui_transcribe(audio):
    try:
        return engine.transcribe(audio)
    except engine.UserError as e:
        raise gr.Error(str(e))


def ui_register(audio, transcript, name):
    name = (name or "").strip() or engine.DEFAULT_VOICE
    if not audio:
        raise gr.Error("먼저 녹음하거나 파일을 올리세요.")
    try:
        dur = engine.register_voice(audio, transcript, name)
        ref = os.path.join(engine.voice_dir(name), "ref.wav")
    except engine.UserError as e:
        raise gr.Error(str(e))
    v1, v2 = _voice_updates(name)
    return f"'{name}' 목소리 등록 완료 ({dur:.1f}초). '말하기' 탭에서 사용하세요.", v1, v2, ref


def ui_try_voice(name):
    if not name:
        raise gr.Error("목소리를 먼저 등록하세요.")
    try:
        path, _, _ = synth_to_history("안녕하세요. 이 목소리가 제 목소리처럼 들리나요?", name, 1.0)
    except engine.UserError as e:
        raise gr.Error(str(e))
    return path


def ui_delete_voice(name):
    if not name:
        raise gr.Error("삭제할 목소리를 고르세요.")
    try:
        engine.delete_voice(name)
    except engine.UserError as e:
        raise gr.Error(str(e))
    v1, v2 = _voice_updates()
    return v1, v2, f"'{name}' 삭제됨"


def ui_history():
    return [[r.get("time", ""), r.get("voice", ""), r.get("seconds", ""), str(r.get("text", ""))[:80]]
            for r in load_history()[:200]]


def ui_history_select(evt: gr.SelectData):
    # 클라이언트가 보낸 표 내용은 믿지 않고, 서버의 기록에서 행 번호로 찾는다
    try:
        f = os.path.basename(load_history()[evt.index[0]]["file"])
    except (IndexError, KeyError, TypeError):
        return None
    p = os.path.realpath(os.path.join(HIST, f))
    return p if p.startswith(os.path.realpath(HIST) + os.sep) and os.path.isfile(p) else None


def ui_dict_load():
    return [[s, d] for s, d in sorted(engine.load_pron_dict(), key=lambda p: p[0].lower())] or [["", ""]]


def ui_dict_save(table):
    rows = table.values.tolist() if hasattr(table, "values") else (table or [])
    engine.save_pron_dict([(r[0], r[1]) for r in rows if len(r) >= 2])
    return "저장했습니다. 바로 적용됩니다. (읽는 법이 빈 줄은 저장하지 않습니다)", ui_dict_load()


# ---------------------------------------------------------------- 화면

SYSTEM_FONT = ["-apple-system", "BlinkMacSystemFont", "Apple SD Gothic Neo", "sans-serif"]
theme = gr.themes.Soft(font=SYSTEM_FONT, font_mono=["ui-monospace", "Menlo", "monospace"])  # 외부 폰트 로드 안 함

with gr.Blocks(title="내 목소리 TTS", theme=theme, analytics_enabled=False,
               delete_cache=(3600, 3600)) as demo:
    gr.Markdown("# 🎙️ 내 목소리 TTS\n텍스트를 입력하면 등록한 내 목소리로 읽어 줍니다. 녹음과 텍스트는 이 맥 밖으로 나가지 않습니다.")
    status = gr.Markdown("모델 준비 중...")

    with gr.Tab("말하기"):
        with gr.Row():
            voice = gr.Dropdown(label="목소리", choices=engine.all_voices(), scale=2)
            speed = gr.Slider(0.7, 1.5, value=1.0, step=0.05, label="속도", scale=3)
        text = gr.Textbox(label="읽을 텍스트", lines=6, placeholder="여기에 텍스트를 입력하세요. 긴 글도 됩니다.")
        with gr.Accordion("이렇게 읽어요 (발음 미리보기)", open=False):
            preview = gr.Textbox(label="정규화된 텍스트", interactive=False, lines=3)
        with gr.Row():
            go = gr.Button("🔊 내 목소리로 읽기", variant="primary", scale=3)
            stop = gr.Button("⏹ 멈춤", scale=1)
        out_audio = gr.Audio(label="결과", type="filepath", autoplay=True, interactive=False)
        info = gr.Markdown()
        text.change(ui_preview, text, preview, show_progress="hidden", trigger_mode="always_last")
        go_evt = go.click(ui_speak, [text, voice, speed], [out_audio, info])
        stop.click(ui_stop, None, info, cancels=[go_evt])

    with gr.Tab("내 목소리 등록"):
        gr.Markdown("1. 아래 문장을 **평소 말투로 또박또박** 읽으며 녹음하세요 (조용한 곳, 5~9초).\n"
                    "2. 파일을 올렸다면 '자동 받아쓰기'로 대사를 채우고 틀린 곳을 고치세요.\n3. '등록'을 누르세요.")
        prompt = gr.Textbox(label="읽을 문장 (녹음한 내용과 정확히 같아야 합니다)", value=PROMPTS[0], lines=2)
        with gr.Row():
            new_prompt = gr.Button("다른 문장")
            asr = gr.Button("자동 받아쓰기 (업로드한 파일용)")
        rec = gr.Audio(label="녹음 또는 파일 업로드", sources=["microphone", "upload"], type="filepath")
        with gr.Row():
            vname = gr.Textbox(label="목소리 이름 (한글·영문·숫자)", value=engine.DEFAULT_VOICE, scale=2)
            reg = gr.Button("등록", variant="primary", scale=1)
        reg_msg = gr.Markdown()
        ref_play = gr.Audio(label="등록된 참조 음성 (무음 제거·음량 보정 후)", type="filepath", interactive=False)

        gr.Markdown("---\n### 등록된 목소리")
        with gr.Row():
            manage = gr.Dropdown(label="목소리", choices=engine.all_voices(), scale=2)
            try_btn = gr.Button("들어보기", scale=1)
            del_btn = gr.Button("삭제", variant="stop", scale=1)
        try_audio = gr.Audio(type="filepath", autoplay=True, interactive=False, label="미리듣기")

    with gr.Tab("기록"):
        gr.Markdown(f"최근 {HISTORY_MAX}개까지 보관합니다. 행을 클릭하면 들을 수 있습니다.")
        refresh = gr.Button("새로고침")
        table = gr.Dataframe(headers=["시간", "목소리", "길이(초)", "텍스트"], interactive=False, wrap=True)
        hist_audio = gr.Audio(label="선택한 기록", type="filepath", interactive=False)

    with gr.Tab("발음 사전"):
        gr.Markdown("자주 틀리게 읽는 단어의 읽는 법을 적어 두세요 (영어는 대소문자 구분 없이 단어 단위로 바뀝니다).\n"
                    "숫자·날짜·전화번호·영어 대문자 약어(AI, GPU)는 자동으로 한글로 읽습니다.")
        dict_table = gr.Dataframe(headers=["원문", "읽는 법"], col_count=(2, "fixed"), interactive=True,
                                  row_count=(1, "dynamic"))
        save_dict = gr.Button("저장", variant="primary")
        dict_msg = gr.Markdown()

    # 이벤트 (기록 표 갱신을 위해 모든 컴포넌트 정의 뒤에 연결)
    go_evt.then(ui_history, None, table)
    new_prompt.click(ui_new_prompt, prompt, prompt)
    asr.click(ui_transcribe, rec, prompt)
    reg.click(ui_register, [rec, prompt, vname], [reg_msg, voice, manage, ref_play])
    try_btn.click(ui_try_voice, manage, try_audio).then(ui_history, None, table)
    del_btn.click(ui_delete_voice, manage, [voice, manage, reg_msg])
    refresh.click(ui_history, None, table)
    table.select(ui_history_select, None, hist_audio)
    save_dict.click(ui_dict_save, dict_table, [dict_msg, dict_table])

    def on_load():
        v1, v2 = _voice_updates()
        return v1, v2, ui_history(), ui_dict_load()

    demo.load(on_load, None, [voice, manage, table, dict_table])
    demo.load(warmup, None, status)
    demo.queue(default_concurrency_limit=1)


# ---------------------------------------------------------------- API (명령줄·단축어용)

class LocalOnly:
    """이 맥의 브라우저 탭(127.0.0.1:7860)과 로컬 프로그램만 허용. 다른 웹사이트·DNS rebinding 차단."""
    HOSTS = {f"127.0.0.1:{PORT}".encode(), f"localhost:{PORT}".encode()}
    ORIGINS = {f"http://127.0.0.1:{PORT}".encode(), f"http://localhost:{PORT}".encode()}

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            h = dict(scope["headers"])
            origin = h.get(b"origin")
            if h.get(b"host") not in self.HOSTS or (origin is not None and origin not in self.ORIGINS):
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                    return
                await send({"type": "http.response.start", "status": 403,
                            "headers": [(b"content-type", b"text/plain; charset=utf-8")]})
                await send({"type": "http.response.body", "body": "forbidden".encode()})
                return
        await self.app(scope, receive, send)


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
WEB = os.path.join(ROOT, "web")


class TTSReq(BaseModel):
    text: str
    voice: str | None = None
    speed: float = 1.0
    seed: int | None = None
    history: bool = True
    job: str | None = None  # 클라이언트 작업 id (멈춤 시 결과를 기록에서 지우기 위해)


class TextReq(BaseModel):
    text: str = ""


class DictRow(BaseModel):
    src: str = ""
    dst: str = ""


def _bad(e):
    return HTTPException(400, str(e))


@app.get("/classic", include_in_schema=False)
def classic_redirect():
    return RedirectResponse("/classic/")


@app.get("/api/health")
def api_health():
    return {"app": APP_ID, "loaded": eng.loaded}


@app.get("/api/status")
def api_status():
    return {"app": APP_ID, "loaded": eng.loaded, "busy": eng.busy(), "asr_ready": engine.asr_ready(),
            "engine": eng.current, "default_voice": engine.default_voice() if engine.all_voices() else None}


class SettingsReq(BaseModel):
    engine: str


@app.get("/api/settings")
def api_settings():
    return {"engine": eng.current, "engines": [{"id": k, "label": v} for k, v in engine.Engine.ENGINES.items()]}


@app.put("/api/settings")
def api_settings_save(req: SettingsReq):
    try:
        eng.set_engine(req.engine)
    except engine.UserError as e:
        raise _bad(e)
    threading.Thread(target=warmup, daemon=True).start()
    return api_settings()


@app.post("/api/tts")
def api_tts(req: TTSReq):
    """WAV 를 돌려준다. 헤더 X-History-Id(기록 파일명), X-Duration(초)."""
    voice = req.voice or engine.default_voice()
    t = time.time()
    try:
        path, secs, data = synth_to_history(req.text, voice, req.speed, req.seed, save=req.history)
    except engine.UserError as e:
        raise _bad(e)
    if req.job and path:
        with _hist_lock:
            if req.job in _cancelled:  # 합성이 끝나기 직전에 멈춤을 누른 경우
                _cancelled.discard(req.job)
                _delete_history_file(os.path.basename(path))
                raise HTTPException(400, "중단되었습니다.")
            _jobs[req.job] = os.path.basename(path)
            while len(_jobs) > 50:
                _jobs.pop(next(iter(_jobs)))
    headers = {"X-Duration": f"{secs:.2f}", "X-Elapsed": f"{time.time() - t:.2f}", "Cache-Control": "no-store"}
    if path:
        headers["X-History-Id"] = os.path.basename(path)
    return Response(data, media_type="audio/wav", headers=headers)


_job_results = {}  # job id → {"history_id", "duration"} (스트리밍 합성 결과)


def _wav_stream_header(sr):
    import struct
    big = 0xFFFFFFFF - 36  # 길이를 모르는 스트리밍 WAV
    return (b"RIFF" + struct.pack("<I", big + 36) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
            + b"data" + struct.pack("<I", big))


@app.post("/api/tts/stream")
async def api_tts_stream(req: TTSReq):
    """생성되는 대로 보내는 WAV(PCM16 mono). 끝나면 기록에 저장하고 GET /api/jobs/{job} 로 결과를 알 수 있다.
    첫 소리가 준비될 때까지 기다린 뒤 응답을 시작하므로, 입력 오류는 400 으로 돌려준다."""
    import numpy as np
    voice = req.voice or engine.default_voice()
    touch()
    gen = eng.synth_stream(req.text, voice, req.speed, req.seed)
    try:
        sr, first = await run_in_threadpool(next, gen)
    except StopIteration:
        raise HTTPException(400, "합성 결과가 비어 있습니다.")
    except engine.UserError as e:
        raise _bad(e)
    t0 = time.time()

    def body():
        parts = [first]
        ok = False
        try:
            yield _wav_stream_header(sr)
            yield first.tobytes()
            for _, chunk in gen:
                parts.append(chunk)
                yield chunk.tobytes()
            ok = True
        except engine.UserError:
            return
        finally:
            gen.close()
            touch()
            if ok and req.history:
                wav = np.concatenate(parts)
                hid, secs = _save_history_wav(req.text, voice, req.speed, sr, wav, seed=req.seed)
                if req.job:
                    with _hist_lock:
                        if req.job in _cancelled:
                            _cancelled.discard(req.job)
                            _delete_history_file(hid)
                            return
                        _jobs[req.job] = hid
                        _job_results[req.job] = {"history_id": hid, "duration": round(secs, 2),
                                                 "elapsed": round(time.time() - t0, 2)}
                        while len(_job_results) > 50:
                            _job_results.pop(next(iter(_job_results)))

    from fastapi.responses import StreamingResponse
    return StreamingResponse(body(), media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.get("/api/jobs/{job}")
def api_job(job: str):
    r = _job_results.get(job)
    if not r:
        raise HTTPException(404, "아직 결과가 없습니다.")
    return r


@app.post("/api/say")
def api_say(req: TTSReq):
    """합성 후 맥 스피커로 바로 재생 (단축어 '선택한 텍스트 읽기'용)."""
    global _play_proc
    try:
        path, secs, _ = synth_to_history(req.text, req.voice or engine.default_voice(), req.speed, req.seed)
    except engine.UserError as e:
        raise _bad(e)
    with _play_lock:
        if _play_proc and _play_proc.poll() is None:
            _play_proc.terminate()
        _play_proc = subprocess.Popen(["afplay", path])
    return {"seconds": round(secs, 1)}


@app.post("/api/stop")
def api_stop(job: str | None = None):
    eng.stop()
    if job:
        with _hist_lock:
            hid = _jobs.pop(job, None)
            if hid:
                _delete_history_file(hid)
            else:
                _cancelled.add(job)
                while len(_cancelled) > 50:
                    _cancelled.pop()
    with _play_lock:
        if _play_proc and _play_proc.poll() is None:
            _play_proc.terminate()
    return {"ok": True}


@app.post("/api/preview")
def api_preview(req: TextReq):
    return {"text": engine.normalize(req.text) if req.text.strip() else ""}


@app.get("/api/prompts")
def api_prompts():
    return PROMPTS


# ---- 목소리
@app.get("/api/voices")
def api_voices():
    default = engine.default_voice()
    out = []
    for n in engine.all_voices():
        try:
            out.append({**engine.voice_info(n), "default": n == default})
        except (OSError, engine.UserError):
            continue
    return out


async def _save_upload(file):
    suffix = os.path.splitext(file.filename or "")[1][:10] or ".bin"
    os.makedirs(os.environ["GRADIO_TEMP_DIR"], exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=suffix, dir=os.environ["GRADIO_TEMP_DIR"])
    size = 0
    with os.fdopen(fd, "wb") as f:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > 30 * 1024 * 1024:
                f.close()
                os.remove(tmp)
                raise HTTPException(413, "파일이 너무 큽니다 (최대 30MB).")
            f.write(chunk)
    return tmp


@app.post("/api/voices")
async def api_voice_register(file: UploadFile = File(...), name: str = Form(""), transcript: str = Form(""),
                             make_default: bool = Form(False)):
    name = name.strip() or engine.DEFAULT_VOICE
    tmp = await _save_upload(file)
    try:
        dur = await run_in_threadpool(engine.register_voice, tmp, transcript, name)
        if make_default or len(engine.list_voices()) == 1:
            engine.set_default_voice(name)
        return {**engine.voice_info(name), "seconds": round(dur, 1)}
    except engine.UserError as e:
        raise _bad(e)
    finally:
        os.remove(tmp)


@app.post("/api/transcribe")
async def api_transcribe(file: UploadFile = File(...)):
    tmp = await _save_upload(file)
    try:
        return {"text": await run_in_threadpool(engine.transcribe, tmp)}
    except engine.UserError as e:
        raise _bad(e)
    except Exception:  # noqa: BLE001
        raise HTTPException(500, "받아쓰기에 실패했습니다. 인터넷 연결(첫 사용 시 모델 다운로드)을 확인하세요.")
    finally:
        os.remove(tmp)


@app.get("/api/voices/{name}/sample")
def api_voice_sample(name: str):
    try:
        wav, _ = engine.get_voice(name)
    except engine.UserError as e:
        raise HTTPException(404, str(e))
    return FileResponse(wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.post("/api/voices/{name}/default")
def api_voice_default(name: str):
    try:
        engine.set_default_voice(name)
    except engine.UserError as e:
        raise _bad(e)
    return {"ok": True}


@app.delete("/api/voices/{name}")
def api_voice_delete(name: str):
    try:
        engine.delete_voice(name)
    except engine.UserError as e:
        raise _bad(e)
    return {"ok": True}


# ---- 기록
def _hist_path(hid):
    p = os.path.realpath(os.path.join(HIST, os.path.basename(hid)))
    if not (p.startswith(os.path.realpath(HIST) + os.sep) and p.endswith(".wav") and os.path.isfile(p)):
        raise HTTPException(404, "기록을 찾을 수 없습니다.")
    return p


@app.get("/api/history")
def api_history(q: str = "", limit: int = 300):
    rows = load_history()
    if q.strip():
        k = q.strip().lower()
        rows = [r for r in rows if k in str(r.get("text", "")).lower() or k in str(r.get("voice", "")).lower()]
    return [{"id": r["file"], "time": r.get("time", ""), "voice": r.get("voice", ""), "speed": r.get("speed", 1.0),
             "seconds": r.get("seconds", 0), "text": r.get("text", ""), "engine": r.get("engine", "sovits"),
             "seed": r.get("seed", 42)} for r in rows[:max(1, min(limit, 300))]]


EXPORT_FORMATS = {"wav": ("audio/wav", None), "mp3": ("audio/mpeg", ["-c:a", "libmp3lame", "-q:a", "2"]),
                  "m4a": ("audio/mp4", ["-c:a", "aac", "-b:a", "160k"])}


def _export(src, fmt):
    """wav 를 mp3/m4a 로 변환한 임시 파일 경로 (wav 면 원본)."""
    if fmt == "wav":
        return src
    os.makedirs(os.environ["GRADIO_TEMP_DIR"], exist_ok=True)
    fd, out = tempfile.mkstemp(suffix="." + fmt, dir=os.environ["GRADIO_TEMP_DIR"])
    os.close(fd)
    r = subprocess.run([engine._ffmpeg(), "-loglevel", "error", "-y", "-i", src, *EXPORT_FORMATS[fmt][1], out],
                       capture_output=True)
    if r.returncode != 0:
        os.remove(out)
        raise HTTPException(500, "파일 변환에 실패했습니다.")
    return out


@app.get("/api/history/{hid}")
def api_history_audio(hid: str, download: int = 0, format: str = "wav"):
    from starlette.background import BackgroundTask
    if format not in EXPORT_FORMATS:
        raise HTTPException(400, "지원하지 않는 형식입니다 (wav, mp3, m4a).")
    p = _hist_path(hid)
    out = _export(p, format)
    name = os.path.splitext(hid)[0] + "." + format
    return FileResponse(out, media_type=EXPORT_FORMATS[format][0], filename=name if download else None,
                        content_disposition_type="attachment" if download else "inline",
                        background=BackgroundTask(os.remove, out) if out != p else None)


def _delete_history_file(hid):
    """_hist_lock 을 잡은 상태에서 호출."""
    try:
        os.remove(_hist_path(hid))
    except (HTTPException, OSError):
        return
    keep = load_history()[::-1]  # load_history 는 파일이 있는 행만 반환
    tmp = os.path.join(HIST, ".index.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.writelines(json.dumps(e, ensure_ascii=False) + "\n" for e in keep)
    os.replace(tmp, os.path.join(HIST, "index.jsonl"))


@app.delete("/api/history/{hid}")
def api_history_delete(hid: str):
    _hist_path(hid)
    with _hist_lock:
        _delete_history_file(hid)
    return {"ok": True}


class IdsReq(BaseModel):
    ids: list[str]
    format: str = "wav"


def _safe_ids(ids):
    out = []
    for hid in dict.fromkeys(ids or []):  # 중복 제거, 순서 유지
        try:
            _hist_path(hid)
            out.append(os.path.basename(hid))
        except HTTPException:
            continue
    return out


@app.post("/api/history/delete")
def api_history_delete_many(req: IdsReq):
    """선택한 기록 여러 개 삭제. 없는 id 는 건너뛴다."""
    ids = _safe_ids(req.ids)
    with _hist_lock:
        for hid in ids:
            try:
                os.remove(os.path.join(HIST, hid))
            except OSError:
                pass
        keep = load_history()[::-1]
        tmp = os.path.join(HIST, ".index.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(json.dumps(e, ensure_ascii=False) + "\n" for e in keep)
        if os.path.isdir(HIST):
            os.replace(tmp, os.path.join(HIST, "index.jsonl"))
    return {"deleted": len(ids)}


def _zip_name_part(s, n):
    import re
    s = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", " ", str(s or "")).strip()
    s = re.sub(r"\s+", " ", s)
    return s[:n].strip().rstrip(". ") or "음성"


@app.post("/api/history/zip")
def api_history_zip(req: IdsReq):
    """선택한 기록을 ZIP 으로 묶어 내려받는다. 파일명: 번호_날짜시간_목소리_문장앞부분.wav + 목록.txt"""
    import zipfile
    from starlette.background import BackgroundTask
    ids = _safe_ids(req.ids)
    if not ids:
        raise HTTPException(400, "내려받을 기록을 선택해 주세요.")
    if req.format not in EXPORT_FORMATS:
        raise HTTPException(400, "지원하지 않는 형식입니다 (wav, mp3, m4a).")
    rows = {r["file"]: r for r in load_history()}
    ids.sort(key=lambda h: (str(rows.get(h, {}).get("time", "")), h))  # 오래된 것부터 번호
    os.makedirs(os.environ["GRADIO_TEMP_DIR"], exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".zip", dir=os.environ["GRADIO_TEMP_DIR"])
    os.close(fd)
    lines = []
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_STORED) as z:
        for i, hid in enumerate(ids, 1):
            r = rows.get(hid, {})
            stamp = str(r.get("time", "")).replace("-", "").replace(":", "").replace(" ", "-")[:13] or hid[:15]
            name = f"{i:03d}_{stamp}_{_zip_name_part(r.get('voice'), 20)}_{_zip_name_part(r.get('text'), 30)}.{req.format}"
            src = os.path.join(HIST, hid)
            conv = _export(src, req.format)
            try:
                z.write(conv, name)
            finally:
                if conv != src:
                    os.remove(conv)
            lines.append(f"{name}\t{r.get('time', '')}\t{r.get('voice', '')}\t{r.get('seconds', '')}초\t{r.get('text', '')}")
        z.writestr("목록.txt", "\ufeff파일\t시간\t목소리\t길이\t텍스트\n" + "\n".join(lines) + "\n")  # BOM: 엑셀 한글
    fname = f"온음_기록_{datetime.now():%Y%m%d-%H%M}_{len(ids)}개.zip"
    return FileResponse(tmp, media_type="application/zip", filename=fname,
                        background=BackgroundTask(os.remove, tmp))


# ---- 발음 사전
@app.get("/api/dict")
def api_dict():
    return [{"src": s, "dst": d} for s, d in sorted(engine.load_pron_dict(), key=lambda p: p[0].lower())]


@app.post("/api/dict/upsert")
def api_dict_upsert(row: DictRow):
    """발음 사전에 한 줄 추가/수정 (같은 원문은 덮어씀, 대소문자 무시)."""
    src, dst = row.src.strip(), row.dst.strip()
    if not src or not dst:
        raise HTTPException(400, "원문과 읽는 법을 모두 입력해 주세요.")
    pairs = [(s_, d_) for s_, d_ in engine.load_pron_dict() if s_.lower() != src.lower()] + [(src, dst)]
    engine.save_pron_dict(pairs)
    return {"src": src, "dst": dst, "preview": engine.normalize(src)}


@app.put("/api/dict")
def api_dict_save(rows: list[DictRow]):
    engine.save_pron_dict([(r.src, r.dst) for r in rows])
    return api_dict()


demo.show_api = False
app = gr.mount_gradio_app(app, demo, path="/classic", allowed_paths=[HIST], max_file_size="30mb")
class NoCacheStatic(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "no-cache"  # 업데이트 후 예전 화면이 남지 않게
        return resp


if os.path.isdir(WEB):
    app.mount("/", NoCacheStatic(directory=WEB, html=True), name="web")
app.add_middleware(LocalOnly)

if __name__ == "__main__":
    shutil.rmtree(os.environ["GRADIO_TEMP_DIR"], ignore_errors=True)
    for d in (engine.VOICES, HIST):
        os.makedirs(d, mode=0o700, exist_ok=True)
        os.chmod(d, 0o700)
    threading.Thread(target=idle_watcher, daemon=True).start()
    threading.Thread(target=warmup, daemon=True).start()  # 시작하자마자 모델 로드
    print(f"내 목소리 TTS: http://127.0.0.1:{PORT}  (끝내려면 이 창을 닫거나 Ctrl+C)")
    print(f"  (예전 화면: http://127.0.0.1:{PORT}/classic)")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
