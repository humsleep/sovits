"""ko_normalize 단위 테스트: GPT-SoVITS/.venv/bin/python test_normalize.py"""
import ko_normalize as kn

D = [("ChatGPT", "챗지피티"), ("km", "킬로미터"), ("iPhone", "아이폰")]
CASES = [
    ("AI로 만든 GPU를 쓴다", ["에이아이로", "지피유를"]),
    ("KTX는 빠르다", ["케이티엑스는"]),
    ("가격은 1,500원이고 인구는 12,345,678명", ["천오백원", "천이백삼십사만오천육백칠십팔명"]),
    ("2026년 10월 1일에 만나요", ["이천이십육년", "시월", "일일에"]),
    ("사과 3개와 학생 10명", ["세개", "열명"]),
    ("3시 30분", ["세시", "삼십분"]),
    ("10:30에 출발", ["열시 삼십분에"]),
    ("2024.10.01 공지", ["이천이십사년 시월 일일"]),
    ("192.168.0.1", []),
    ("성공률은 35%", ["삼십오퍼센트"]),
    ("3.14는 원주율", ["삼 점 일사는"]),
    ("3.5kg 감자", ["삼 점 오킬로그램"]),
    ("010-1234-5678로 전화", ["공일공, 일이삼사, 오육칠팔로"]),
    ("background 음악", ["background"]),  # 사전 km/kg 이 단어 안을 바꾸면 안 됨
    ("chatgpt 써봤어?", ["챗지피티"]),
    ("5km 달리기", ["오킬로미터"]),
    ("Python 코드", ["파이"]),
    ("첫 문장\n둘째 줄", ["첫 문장. 둘째 줄."]),
    ("항목 1.\n2번", ["번"]),
    ("https://example.com/a?b=1 참고", ["링크 참고"]),
    ("오늘 기분 😀 최고 #행복", ["최고 행복"]),
    ("$5 짜리", ["오달러"]),
    ("3~5명", ["삼에서 다섯명"]),
    ("기온은 -5도이고 -3℃", ["영하 오도", "영하 삼도"]),
    ("결과는 -12", ["마이너스 십이"]),
    ("010-1234-5678", ["공일공, 일이삼사"]),
]
bad = 0
for src, wants in CASES:
    out = kn.normalize(src, D)
    ok = all(w in out for w in wants) and not any(c.isdigit() for c in out)
    if src == "background 음악":
        ok = "킬로" not in out
    bad += not ok
    print("OK " if ok else "BAD", repr(src), "->", repr(out))
print(f"\n{len(CASES) - bad}/{len(CASES)} passed")
