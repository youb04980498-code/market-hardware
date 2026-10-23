import hashlib
import json
import sys
import urllib.request
from pathlib import Path

target = Path(sys.argv[1])
target.mkdir(parents=True, exist_ok=True)
for artifact in json.loads(Path(sys.argv[2]).read_text()):
    file = target / artifact['url'].rsplit('/', 1)[-1]
    urllib.request.urlretrieve(artifact['url'], file)
    if hashlib.sha512(file.read_bytes()).hexdigest() != artifact['sha512']:
        raise SystemExit('Maven artifact checksum mismatch')
