"""텍스트를 내 목소리로 합성한다 (명령줄용). 웹 앱이 켜져 있으면 그쪽에 요청해 즉시 처리한다.

사용법:
  ./speak.sh "읽을 문장" [-o out/파일.wav] [--voice 기본]
  ./speak.sh -f 대본.txt -o out/대본.wav
  ./speak.sh -- "-5도까지 내려갑니다"      # '-'로 시작하는 문장은 앞에 -- 를 붙인다
목소리 등록: ./prep_ref.sh 녹음파일.m4a "녹음에서 읽은 문장" [목소리이름]
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

import engine

SERVER = "http://127.0.0.1:7860"
APP_ID = "my-voice-tts"


def server_up():
    try:
        with urllib.request.urlopen(f"{SERVER}/api/health", timeout=2) as r:
            return json.loads(r.read()).get("app") == APP_ID
    except (OSError, ValueError, AttributeError):
        return False


def via_server(text, voice, speed, seed, out):
    """웹 앱으로 합성. 앱이 없거나 다른 프로그램이면 False (→ 직접 합성)."""
    if not server_up():
        return False
    req = urllib.request.Request(
        f"{SERVER}/api/tts", method="POST", headers={"Content-Type": "application/json"},
        data=json.dumps({"text": text, "voice": voice, "speed": speed, "seed": seed}).encode())
    try:
        with urllib.request.urlopen(req, timeout=3600) as r:
            if r.headers.get_content_type() != "audio/wav":
                return False
            data = r.read()
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read() or b"{}").get("detail")
        except ValueError:
            detail = None
        if e.code == 400 and isinstance(detail, str):
            raise engine.UserError(detail)
        raise engine.UserError(f"웹 앱 오류 ({e.code}). 앱 창의 메시지를 확인하거나 --local 로 실행하세요.")
    except (OSError, TimeoutError):
        return False
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(data)
    return True


def main():
    p = argparse.ArgumentParser(description="텍스트를 내 목소리로 변환")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("text", nargs="?")
    src.add_argument("-f", "--file", help="읽을 텍스트 파일(UTF-8)")
    p.add_argument("-o", "--out", default=os.path.join(engine.ROOT, "out", "output.wav"))
    p.add_argument("--voice", default=None, help="등록한 목소리 이름 (기본: 기본 목소리)")
    p.add_argument("--speed", type=float, default=1.0, help="0.5~2.0")
    p.add_argument("--seed", type=int, default=None, help="기본 42, -1 이면 매번 무작위")
    p.add_argument("--local", action="store_true", help="웹 앱이 켜져 있어도 직접 합성 (메모리 2배 사용)")
    args = p.parse_args()
    args.out = os.path.abspath(args.out)

    try:
        if args.file:
            if not os.path.isfile(args.file):
                raise engine.UserError(f"텍스트 파일이 없습니다: {args.file}")
            with open(args.file, encoding="utf-8") as f:
                args.text = f.read()
        engine.check_text(args.text)
        if not engine.SPEED_MIN <= args.speed <= engine.SPEED_MAX:
            raise engine.UserError(f"--speed 는 {engine.SPEED_MIN}~{engine.SPEED_MAX} 사이여야 합니다.")
        args.voice = args.voice or engine.default_voice()
        engine.get_voice(args.voice)  # 모델 로딩 전에 목소리 확인

        t = time.time()
        if not args.local and via_server(args.text, args.voice, args.speed, args.seed, args.out):
            print(f"saved {args.out} (웹 앱 사용, {time.time() - t:.1f}s)")
            return
        eng = engine.Engine()
        sr, wav = eng.synth(args.text, voice=args.voice, speed=args.speed, seed=args.seed)
        engine.write_wav(args.out, sr, wav)
        print(f"saved {args.out} ({len(wav) / sr:.1f}초 음성, 총 {time.time() - t:.1f}s)")
    except engine.UserError as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
