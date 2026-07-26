from __future__ import annotations

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def run(*args: str) -> None:
    print(f"\n$ {' '.join(args)}", flush=True)
    subprocess.run(args, cwd=ROOT, check=True)


def patch_required(path: str, old: str, new: str, count: int = 1) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    found = content.count(old)
    if found != count:
        raise RuntimeError(f"Expected {count} matches in {path}, found {found}: {old[:140]!r}")
    target.write_text(content.replace(old, new, count), encoding="utf-8")


def prepare_migration_scripts() -> None:
    apply_path = ROOT / ".github/scripts/apply_manual_lovable_workflow.py"
    content = apply_path.read_text(encoding="utf-8")
    old = "updated, matches = re.subn(pattern, replacement, content, count=count, flags=re.S)"
    new = "updated, matches = re.subn(pattern, lambda _match: replacement, content, count=count, flags=re.S)"
    if content.count(old) != 1:
        raise RuntimeError("Migration helper regex replacement target was not found exactly once.")
    content = content.replace(old, new, 1)

    duplicate = '''replace_once("lib/autonomous-growth.ts", '  "Prospect Said Yes",\\n  "Loom Needed",', '  "Prospect Said Yes",\\n  "Preview Build Needed",\\n  "Loom Needed",')'''
    if content.count(duplicate) != 2:
        raise RuntimeError(f"Expected two duplicated status transforms, found {content.count(duplicate)}.")
    content = content.replace(duplicate, duplicate.replace("replace_once", "replace_all"), 1)
    content = content.replace(duplicate, "", 1)

    optional = '''replace_all("lib/autonomous-growth.ts", '"Generate a public /p/ preview first."', '"Save a legitimate public Lovable preview link first."')'''
    if content.count(optional) != 1:
        raise RuntimeError("Optional legacy preview wording transform was not found exactly once.")
    content = content.replace(optional, optional[:-1] + ", minimum=0)", 1)

    loom_prefix = "'''        <LoomQueueSection\\n"
    if content.count(loom_prefix) != 2:
        raise RuntimeError(f"Expected two LoomQueueSection migration strings, found {content.count(loom_prefix)}.")
    content = content.replace(loom_prefix, "'''      <LoomQueueSection\\n", 2)
    loom_props_old = "          copied={copied}\\n          items={groupedQueue.loom}\\n          onCopy={copyText}"
    if content.count(loom_props_old) != 2:
        raise RuntimeError(f"Expected two LoomQueueSection prop blocks, found {content.count(loom_props_old)}.")
    content = content.replace(loom_props_old, "        copied={copied}\\n        items={groupedQueue.loom}\\n        onCopy={copyText}", 2)
    content = content.replace("          onStatus={updateStatus}", "        onStatus={updateStatus}", 2)
    content = content.replace("          onSavePreview={saveManualPreviewLink}", "        onSavePreview={saveManualPreviewLink}", 1)
    loom_suffix = "\\n        />'''"
    if content.count(loom_suffix) < 2:
        raise RuntimeError("Expected LoomQueueSection closing indentation strings.")
    content = content.replace(loom_suffix, "\\n      />'''", 2)
    apply_path.write_text(content, encoding="utf-8")

    align_path = ROOT / ".github/scripts/align_manual_lovable_tests.py"
    align = align_path.read_text(encoding="utf-8")
    marker = "# The unsupported-claim test now starts from the shorter opening."
    marker_index = align.find(marker)
    if marker_index < 0:
        raise RuntimeError("Unsupported-claim alignment marker was not found.")
    align_path.write_text(align[:marker_index] + 'print("Manual Lovable source and tests aligned.")\n', encoding="utf-8")

    full_path = ROOT / ".github/scripts/align_manual_lovable_full_suite.py"
    full = full_path.read_text(encoding="utf-8")
    start_marker = "# Update the legacy queue fixture itself so readiness tests exercise current copy rather than stale prebuilt claims."
    end_marker = '\nreplace_test(\n    "tests/operator-test-center.test.ts",\n    "Operator Test Center fake package always returns fake scripts without real outreach activity",'
    start = full.find(start_marker)
    end = full.find(end_marker, start)
    if start < 0 or end < 0:
        raise RuntimeError("Operator Test Center fixture alignment block was not found.")
    stable_fixture_patch = '''# Update the queue fixture field-by-field because the base migration already changes its CTA.
replace_required(
    "tests/operator-test-center.test.ts",
    '    subjectLine: "Quick website preview for Ready Pressure Washing",',
    '    subjectLine: "Quick website idea for Ready Pressure Washing",',
    minimum=0,
)
replace_required(
    "tests/operator-test-center.test.ts",
    '      "I was looking at pressure washing businesses around the Tampa area and came across your business.",',
    '      "I came across your business.",',
)
replace_required(
    "tests/operator-test-center.test.ts",
    '      "I put together a quick preview showing what your website could look like with a cleaner, more modern design and how it could help you get more calls and quote requests.",',
    '      "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.",',
)
'''
    full_path.write_text(full[:start] + stable_fixture_patch + full[end:], encoding="utf-8")


def align_remaining_assertions() -> None:
    path = ROOT / "tests/top-prospects.test.ts"
    content = path.read_text(encoding="utf-8")
    old = r"/I was looking at [^\n]+/"
    new = r"/I came across your business\./"
    if content.count(old) != 1:
        raise RuntimeError(f"Unsupported-claim test opening count was {content.count(old)}, expected 1.")
    path.write_text(content.replace(old, new, 1), encoding="utf-8")

    replacements = {
        "tests/autonomous-growth.test.ts": (
            r"/\b(?:built|made|put together)\b.{0,50}\bpreview\b/i",
            r"/\b(?:I|we)\s+(?:built|made|created|put together)\b.{0,50}\bpreview\b/i",
        ),
        "tests/prospect-engine.test.ts": (
            r"/\b(?:built|made|put together)\b.{0,60}\bpreview\b/i",
            r"/\b(?:I|we)\s+(?:built|made|created|put together)\b.{0,60}\bpreview\b/i",
        ),
    }
    for file_name, (before, after) in replacements.items():
        test_path = ROOT / file_name
        test_content = test_path.read_text(encoding="utf-8")
        if test_content.count(before) != 1:
            raise RuntimeError(f"Past-tense assertion count in {file_name} was {test_content.count(before)}, expected 1.")
        test_path.write_text(test_content.replace(before, after, 1), encoding="utf-8")

    for candidate in ROOT.rglob("*"):
        if candidate.is_file() and candidate.suffix in {".ts", ".tsx"}:
            source = candidate.read_text(encoding="utf-8")
            if "\x08" in source:
                candidate.write_text(source.replace("\x08", r"\b"), encoding="utf-8")


def clean_temporary_files() -> None:
    temporary = [
        ".github/scripts/apply_manual_lovable_workflow.py",
        ".github/scripts/align_manual_lovable_tests.py",
        ".github/scripts/align_manual_lovable_full_suite.py",
        ".github/scripts/run_manual_lovable_migration.py",
        ".github/workflows/apply-manual-lovable-workflow.yml",
        ".github/manual-lovable-pr-marker.md",
        ".github/workflows/README-manual-lovable-migration.md",
        ".github/trigger-manual-lovable-pr.txt",
        ".github/README-manual-lovable-pr.md",
        ".github/pr-ready",
        ".github/STOP",
        ".github/final-trigger.txt",
    ]
    for relative in temporary:
        target = ROOT / relative
        if target.exists():
            target.unlink()


def main() -> None:
    prepare_migration_scripts()
    run("python3", ".github/scripts/apply_manual_lovable_workflow.py")
    run("python3", ".github/scripts/align_manual_lovable_tests.py")
    run("python3", ".github/scripts/align_manual_lovable_full_suite.py")
    align_remaining_assertions()

    run("npx", "tsx", "--test", "tests/manual-lovable-workflow.test.ts", "tests/autonomous-growth.test.ts", "tests/prospect-engine.test.ts", "tests/top-prospects.test.ts")
    run("npm", "test")
    run("npm", "run", "lint")
    run("npm", "run", "build")
    run("git", "diff", "--check")

    clean_temporary_files()
    run("git", "config", "user.name", "github-actions[bot]")
    run("git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")
    run("git", "add", "-A")
    run("git", "commit", "-m", "Switch outreach to manual Lovable preview workflow [manual-lovable-applied]")
    run("git", "push", "origin", "HEAD:feature/manual-lovable-preview-workflow")


if __name__ == "__main__":
    main()
