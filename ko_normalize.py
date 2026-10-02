"""TTS 입력용 한국어 텍스트 정규화.

모델이 숫자·영어를 자주 틀리게 읽으므로, 합성 전에 가능한 한 '읽는 그대로의 한글'로 바꾼다.
순서: 사용자 발음 사전 → URL/이모지/기호 → 날짜·시간·전화번호·단위 → 숫자(g2pk2) → 약어·영어 → 문장 분할 보정
"""
import os
import re
import sys
import threading

MAX_SEG = 60  # 구두점 없이 이보다 긴 구간은 모델이 무너지므로 강제로 끊는다
_PUNCT = ".!?。？！…,，"

_LETTERS = dict(zip(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "에이 비 씨 디 이 에프 지 에이치 아이 제이 케이 엘 엠 엔 오 피 큐 알 에스 티 유 브이 더블유 엑스 와이 지".split(),
))
_DIGITS = dict(zip("0123456789", "공일이삼사오육칠팔구"))
_UNITS = [  # 숫자 뒤에서만 바꾼다
    ("km", "킬로미터"), ("kg", "킬로그램"), ("cm", "센티미터"), ("mm", "밀리미터"), ("m²", "제곱미터"),
    ("㎡", "제곱미터"), ("ml", "밀리리터"), ("mL", "밀리리터"), ("GB", "기가바이트"), ("MB", "메가바이트"),
    ("TB", "테라바이트"), ("kWh", "킬로와트시"), ("km/h", "킬로미터"), ("°C", "도"), ("℃", "도"),
    ("g", "그램"), ("m", "미터"), ("L", "리터"), ("$", "달러"), ("₩", "원"), ("€", "유로"),
]

# 고유어 수(하나, 둘, 셋...)로 읽는 단위 (g2pk2 목록 + 보강)
NATIVE_COUNTERS = set("""군데 권 개 그루 닢 대 두 마리 모 모금 뭇 발 발짝 방 번 벌 보루 살 수 술 시 쌈 움큼 정 짝 채 척 첩 축 켤레 톨 통
명 사람 잔 병 장 가지 곳 송이 쌍 줄 판 시간 달 마디 그릇 접시 조각 걸음 바퀴 군데""".split())

_g2p = None
_g2p_lock = threading.Lock()


def _get_g2p():
    global _g2p
    with _g2p_lock:
        if _g2p is None:
            os.environ.setdefault("NLTK_DATA", os.path.join(sys.prefix, "nltk_data"))
            from g2pk2 import G2p
            _g2p = G2p()
        return _g2p


# ---------------------------------------------------------------- 사용자 사전

def _key_re(src):
    pre = r"(?<![A-Za-z])" if src[0].isascii() and src[0].isalpha() else ""
    post = r"(?![A-Za-z])" if src[-1].isascii() and src[-1].isalpha() else ""
    return pre + re.escape(src) + post


def apply_dict(text, pairs):
    """한 번에 치환(연쇄 치환 없음). 영어 키는 단어 경계 + 대소문자 무시."""
    if not pairs:
        return text
    lookup = {s.lower(): d for s, d in pairs}
    pat = re.compile("|".join(_key_re(s) for s, _ in sorted(pairs, key=lambda p: -len(p[0]))), re.IGNORECASE)
    return pat.sub(lambda m: lookup.get(m.group().lower(), m.group()), text)


# ---------------------------------------------------------------- 숫자

def _digits(s):
    return "".join(_DIGITS.get(c, c) for c in s)


def _sino(n):
    from g2pk2.numerals import process_num
    n = n.lstrip("0") or "0"
    return "영" if n == "0" else process_num(n, sino=True)


def _numbers_with_counters(text):
    """'3개'→'세개', '1500원'→'천오백원'처럼 뒤에 붙은 단위에 맞춰 고유어/한자어 수로 읽는다 (g2pk2 규칙)."""
    if not re.search(r"\d", text):
        return text
    from g2pk2.utils import annotate
    annotated = annotate(text, _get_g2p().mecab)
    if re.sub(r"/[PJEB]", "", annotated) == text:  # 주석을 지웠을 때 원문과 같을 때만 사용
        for num, bn in set(re.findall(r"(\d+)([가-힣]+)/B", annotated)):
            annotated = annotated.replace(f"{num}{bn}/B", f"{_native_or_sino(num, bn in NATIVE_COUNTERS)}{bn}/B")
        text = re.sub(r"/[PJEB]", "", annotated)
    # 남은 숫자: 0으로 시작하면 한 자리씩, 아니면 한자어 수
    return re.sub(r"\d+", lambda m: _digits(m.group()) if len(m.group()) > 1 and m.group()[0] == "0"
                  else _sino(m.group()), text)


def _native_or_sino(num, native):
    from g2pk2.numerals import process_num
    n = num.lstrip("0") or "0"
    if native and int(n) < 100:
        return process_num(n, sino=False)
    return _sino(n)


def normalize_numbers(text):
    # 전화번호: 숫자 하나씩, 0 은 '공'
    text = re.sub(r"(?<!\d)(0\d{1,2})-(\d{3,4})-(\d{4})(?!\d)",
                  lambda m: ", ".join(_digits(g) for g in m.groups()), text)
    # 날짜: 2026.10.01 / 2026-10-01 / 2026/10/01
    text = re.sub(r"(?<![\d.])(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?![\d.])",
                  lambda m: f"{int(m.group(1))}년 {int(m.group(2))}월 {int(m.group(3))}일", text)
    # 시간: 10:30
    text = re.sub(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)", lambda m: f"{int(m.group(1))}시 {int(m.group(2))}분", text)
    # 음수: -5도 → 영하 5도, -3 → 마이너스 3
    text = re.sub(r"(?<![\w.\d])[-−](\d+(?:\.\d+)?)(?=\s*(?:도|℃|°C))", r"영하 \1", text)
    text = re.sub(r"(?<![\w.\d])[-−](?=\d)", "마이너스 ", text)
    # 천 단위 쉼표
    text = re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", text)
    # 범위 3~5
    text = re.sub(r"(\d)\s*[~∼〜]\s*(\d)", r"\1에서 \2", text)
    # 퍼센트 / 단위 (숫자 바로 뒤에서만)
    text = re.sub(r"(\d)\s*%", r"\1퍼센트", text)
    for u, spoken in sorted(_UNITS, key=lambda p: -len(p[0])):
        if u in "$₩€":
            text = re.sub(re.escape(u) + r"\s*(\d+(?:\.\d+)?)", rf"\1{spoken}", text)
        else:
            text = re.sub(r"(\d)\s*" + re.escape(u) + r"(?![A-Za-z])", rf"\1{spoken}", text)
    # 소수: 3.14 → 삼 점 일사 (날짜·버전·IP 는 제외)
    text = re.sub(r"(?<![\d.])(\d+)\.(\d+)(?![\d.]?\d)", lambda m: f"{_sino(m.group(1))} 점 {_digits(m.group(2)).replace('공', '영')}", text)
    text = _numbers_with_counters(text)
    text = text.replace("십월", "시월").replace("육월", "유월")
    return text


# ---------------------------------------------------------------- 영어

def normalize_english(text, transliterate=True):
    # 대문자 약어(AI, GPU, KTX)는 알파벳 이름으로. 'AI로'처럼 조사가 붙어도 동작
    text = re.sub(r"(?<![A-Za-z])[A-Z]{2,6}(?![a-z])",
                  lambda m: "".join(_LETTERS[c] for c in m.group()), text)
    if not transliterate or not re.search(r"[A-Za-z]", text):
        return text
    from g2pk2.english import convert_eng
    cmu = _get_g2p().cmu
    # 사전(CMU)에 있는 영어 단어는 한글 표기로 (없으면 모델의 영어 발음 처리에 맡김)
    return re.sub(r"[A-Za-z][A-Za-z']*", lambda m: convert_eng(m.group(), cmu), text)


# ---------------------------------------------------------------- 문장 분할

def _split_long(seg):
    out, cur = [], ""
    for word in seg.split():
        if cur and len(cur) + len(word) + 1 > MAX_SEG:
            out.append(cur + ",")
            cur = word
        else:
            cur = f"{cur} {word}" if cur else word
    out.append(cur)
    return " ".join(out)


def segment(text):
    parts = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line[-1] not in _PUNCT:
            line += "."  # 줄바꿈을 문장 경계로
        parts.append(line)
    text = " ".join(parts)
    pieces = re.split(rf"([{_PUNCT}]+\s*)", text)
    return "".join(_split_long(p) if i % 2 == 0 else p for i, p in enumerate(pieces)).strip()


# ---------------------------------------------------------------- 전체

def split_sentences(text, max_len=120):
    """정규화된 텍스트를 문장 단위로 나눈다 (Qwen3 는 문장 하나씩 합성할 때 가장 안정적)."""
    out = []
    for sent in re.split(r"(?<=[.!?。？！…])\s+", text.strip()):
        sent = sent.strip()
        while len(sent) > max_len:  # 너무 긴 문장은 쉼표 → 공백 위치에서 자른다
            cut = max(sent.rfind(",", 0, max_len), sent.rfind("，", 0, max_len))
            if cut < max_len // 3:
                cut = sent.rfind(" ", 0, max_len)
            if cut < max_len // 3:
                cut = max_len
            out.append(sent[:cut + 1].strip())
            sent = sent[cut + 1:].strip()
        if re.search(r"[0-9A-Za-z가-힣]", sent):
            out.append(sent)
    return out


def normalize(text, pairs=(), english=True):
    text = apply_dict(text, list(pairs))
    text = re.sub(r"https?://\S+|www\.\S+", "링크", text)
    text = re.sub(r"\S+@\S+\.\w+", "이메일 주소", text)
    text = re.sub(r"[#@](?=[\w가-힣])", "", text)  # #태그, @멘션 → 단어만
    text = re.sub(r"[\U0001F000-\U0001FAFF☀-➿️‍]", " ", text)  # 이모지
    text = text.replace("&", " 앤 ").replace("+", " 플러스 ")
    text = normalize_numbers(text)
    text = normalize_english(text, transliterate=english)
    text = re.sub(r"[ \t]+", " ", text)
    return segment(text)
