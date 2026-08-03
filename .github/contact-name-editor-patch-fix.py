from pathlib import Path

path = Path('.github/contact-name-editor-patch.py')
text = path.read_text()
old = '''replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '        .email-draft-review-body {\\n',
    contact_editor_css + '        .email-draft-review-body {\\n',
)
'''
new = '''replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '        .email-draft-review-body {\\n          padding: 18px 26px 0;\\n',
    contact_editor_css + '        .email-draft-review-body {\\n          padding: 18px 26px 0;\\n',
)
'''
if text.count(old) != 1:
    raise SystemExit(f'expected one CSS patch block, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
