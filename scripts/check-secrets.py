"""Scan tracked text candidates for local secret values without printing values."""
import re
import subprocess
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def main():
    candidates = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard'], cwd=ROOT, text=True).splitlines()
    secrets = [value for key, value in dotenv_values(ROOT / '.env').items()
        if value and len(value) >= 12 and re.search('PASSWORD|SECRET|TOKEN|PSEUDONYM', key)]
    failed = []
    for name in set(candidates):
        path = ROOT / name
        if not path.is_file() or path.stat().st_size > 5_000_000:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except (UnicodeError, OSError):
            continue
        private_key = re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text)
        if private_key or any(secret in text for secret in secrets):
            failed.append(name)
    if failed:
        raise RuntimeError('Local secret detected in: ' + ', '.join(failed))
    print('Tracked candidate local-secret scan: PASS')


if __name__ == '__main__':
    main()
