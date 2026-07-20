#!/usr/bin/env python3
"""Minimal local Python kernel for the AI4S Workbench notebook.

A persistent process that holds one namespace across cells (shared state, like a
Jupyter kernel) and speaks a line-delimited JSON protocol over stdin/stdout:

    request : {"id": "<str>", "code": "<str>"}\\n
    response: {"id","ok","stdout","result","error"}\\n

Standard library only — no ipykernel/ZMQ — so it runs against whatever Python the
user has, offline, with no model key. `result` mirrors Jupyter: the repr of the
final expression when a cell ends in one, else null.
"""
import ast
import base64
import io
import json
import os
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout

# Force a non-interactive matplotlib backend BEFORE the user's code imports
# pyplot, so plt.show() renders to an in-memory buffer we can capture (Jupyter
# inline semantics) instead of trying to open a GUI window — which in this
# headless bridge would fail or hang, so a plotting cell produced no figure at
# all. Harmless when matplotlib is never used.
os.environ.setdefault("MPLBACKEND", "Agg")


def _install_academic_mpl_fonts():
    """Academic figure typography, applied the moment the user imports
    matplotlib — WITHOUT eagerly importing it here (a non-plotting kernel stays
    light). We hand matplotlib a matplotlibrc via MATPLOTLIBRC, which it reads
    once at import, before the user's first plot: Latin + numbers in Times New
    Roman, and CJK falling through to a black-body face via matplotlib's
    per-glyph font fallback — the 中文黑体 / 英文数字 Times New Roman convention
    for papers. axes.unicode_minus off gives a real minus sign, not a tofu box.

    The CJK font list is built for THIS platform only (Heiti on macOS,
    SimHei / YaHei on Windows): a cross-platform list makes matplotlib log a
    'font not found' warning per missing family on every findfont call, and
    those land in the user's cell output. setdefault: a user who sets their own
    MATPLOTLIBRC (or overrides rcParams in code) always wins. Never raises —
    typography is a nicety, it must not block a kernel from starting."""
    try:
        import pathlib
        import tempfile

        if sys.platform == "darwin":
            cjk = ["Heiti TC", "Heiti SC", "PingFang SC", "Songti SC"]
        elif sys.platform.startswith("win"):
            cjk = ["SimHei", "Microsoft YaHei", "SimSun"]
        else:  # linux and the rest
            cjk = ["Noto Sans CJK SC", "WenQuanYi Zen Hei", "Noto Serif CJK SC"]
        families = ", ".join(["Times New Roman", *cjk, "DejaVu Serif"])

        cfg = pathlib.Path(tempfile.gettempdir()) / "fishes-mpl"
        cfg.mkdir(exist_ok=True)
        rc = cfg / "matplotlibrc"
        rc.write_text(
            f"font.family: {families}\naxes.unicode_minus: False\n",
            encoding="utf-8",
        )
        os.environ.setdefault("MATPLOTLIBRC", str(rc))

        # Per-glyph fallback makes matplotlib log 'font family X not found' for
        # every listed CJK name its index doesn't match (name registration for
        # .ttc collections is machine-dependent) — cosmetic noise that would
        # land in the user's cell output on every plot. Getting the logger by
        # name creates it now with an ERROR floor; matplotlib.font_manager
        # reuses that same logger when it imports later. A genuine unrenderable
        # glyph is still visible as a tofu box in the image itself.
        import logging

        logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
    except Exception:
        pass


_install_academic_mpl_fonts()


def capture_figures():
    """Snapshot every open matplotlib figure as a base64 PNG, then close them
    (inline semantics: each cell's figures show once). Returns [] when matplotlib
    was never imported or nothing was drawn. Never raises — plotting is optional."""
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return []
    images = []
    try:
        for num in plt.get_fignums():
            buf = io.BytesIO()
            try:
                plt.figure(num).savefig(buf, format="png", bbox_inches="tight", dpi=120)
                images.append(base64.b64encode(buf.getvalue()).decode("ascii"))
            except Exception:
                pass  # one bad figure must not sink the others / the cell
        plt.close("all")
    except Exception:
        pass
    return images


def run_cell(ns: dict, code: str):
    """Execute `code` in namespace `ns`. Returns (stdout, result_repr_or_None, error_or_None)."""
    out = io.StringIO()
    try:
        parsed = ast.parse(code, mode="exec")
    except SyntaxError:
        return "", None, traceback.format_exc(limit=1)

    body = parsed.body
    result = None
    # Jupyter behaviour: if the cell ends in an expression, show its value.
    tail_expr = None
    if body and isinstance(body[-1], ast.Expr):
        last = body.pop()
        assert isinstance(last, ast.Expr)
        tail_expr = ast.Expression(last.value)

    try:
        with redirect_stdout(out), redirect_stderr(out):
            if body:
                exec(compile(ast.Module(body, []), "<cell>", "exec"), ns)  # noqa: S102
            if tail_expr is not None:
                value = eval(compile(tail_expr, "<cell>", "eval"), ns)  # noqa: S307
                if value is not None:
                    result = repr(value)
    except Exception:  # surface the traceback to the notebook, like a kernel does
        return out.getvalue(), None, traceback.format_exc()

    return out.getvalue(), result, None


def main() -> None:
    ns: dict = {"__name__": "__main__"}
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        stdout, result, error = run_cell(ns, req.get("code", ""))
        # Capture figures even when the cell errored — plots drawn before the
        # error still show, like a real kernel.
        resp = {
            "id": req.get("id"),
            "ok": error is None,
            "stdout": stdout,
            "result": result,
            "error": error,
            "images": capture_figures(),
        }
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
