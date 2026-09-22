# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools[woff]==4.61.1"]
# ///
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
MODULES = WEB / "node_modules"
OUT = WEB / "src" / "assets" / "fonts"

LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,"
    "U+2215,U+FEFF,U+FFFD"
)

FONTS = {
    "pretendard-variable.woff2": MODULES
    / "pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
    "iosevka-regular.woff2": MODULES
    / "@fontsource/iosevka/files/iosevka-latin-400-normal.woff2",
    "iosevka-italic.woff2": MODULES
    / "@fontsource/iosevka/files/iosevka-latin-400-italic.woff2",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, source in FONTS.items():
        target = OUT / name
        subset.main(
            [
                str(source),
                f"--output-file={target}",
                f"--unicodes={LATIN}",
                "--flavor=woff2",
                "--no-hinting",
            ]
        )
        print(f"{target.relative_to(ROOT)}  {target.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
