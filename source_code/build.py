"""제출용 빌드: 모든 CSS·JS·이미지·글꼴을 HTML 한 파일에 담고 ZIP으로 묶는다.

사용법: python build.py
결과물: dist/index.html, 바탕화면의 스마트사진편집_제출.zip
"""
import base64
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
HTML_NAME = "index.html"
ZIP_PATH = ROOT.parent / "스마트사진편집_제출.zip"

LIB_SCRIPTS = ["lib/jszip.min.js", "lib/pako.min.js", "lib/UTIF.js", "lib/heic2any.min.js"]
SOURCE_FILES = ["index.html", "style.css", "app.js", "kmou_logo.png", "build.py",
                "lib/jszip.min.js", "lib/pako.min.js", "lib/UTIF.js", "lib/heic2any.min.js",
                "lib/PretendardVariable.woff2"]

README = """스마트 사진 편집 - 실행 방법

1. index.html 파일을 더블클릭하면 브라우저에서 바로 열립니다.
   (크롬 또는 엣지 권장, 인터넷 연결 없이도 동작합니다)

2. source_code 폴더에는 개발용 원본 코드가 들어 있습니다.
   - index.html / style.css / app.js : 화면 구조, 디자인, 기능
   - lib : 압축(JSZip), TIFF(UTIF, pako), HEIC(heic2any) 라이브러리와 Pretendard 글꼴
   - build.py : 원본 코드를 HTML 한 파일로 합쳐 주는 스크립트
"""


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def safe_script(js: str) -> str:
    # 인라인 <script> 안에서 태그가 일찍 닫히거나 주석 모드로 빠지지 않도록
    js = re.sub(r"</(script)", r"<\\/\1", js, flags=re.IGNORECASE)
    return js.replace("<!--", "<\\!--")


def build_html() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")

    font = data_uri(ROOT / "lib/PretendardVariable.woff2", "font/woff2")
    css = css.replace('url("lib/PretendardVariable.woff2")', f'url("{font}")')

    html = html.replace('<link rel="stylesheet" href="style.css" />', f"<style>\n{css}\n</style>")
    html = html.replace('src="kmou_logo.png"', f'src="{data_uri(ROOT / "kmou_logo.png", "image/png")}"')

    scripts = "".join(
        f"<script>\n{safe_script((ROOT / p).read_text(encoding='utf-8'))}\n</script>\n" for p in LIB_SCRIPTS
    )
    scripts += f"<script>\n{safe_script(app)}\n</script>"
    html = html.replace('<script src="app.js"></script>', scripts)

    for leftover in ('href="style.css"', 'src="app.js"', 'src="kmou_logo.png"', "lib/PretendardVariable"):
        if leftover in html:
            raise SystemExit(f"치환 실패: {leftover}")
    return html


def main() -> None:
    DIST.mkdir(exist_ok=True)
    out = DIST / HTML_NAME
    out.write_text(build_html(), encoding="utf-8")

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(out, HTML_NAME)
        z.writestr("README.txt", "\ufeff" + README)
        for f in SOURCE_FILES:
            z.write(ROOT / f, f"source_code/{f}")

    print(f"HTML: {out} ({out.stat().st_size / 1048576:.1f} MB)")
    print(f"ZIP : {ZIP_PATH} ({ZIP_PATH.stat().st_size / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
