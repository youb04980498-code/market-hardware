"""Transport audit and business identity are deliberately distinct."""
import json
from datetime import UTC, datetime
from uuid import UUID

from jsonschema import Draft202012Validator, FormatChecker

from market_analytics.config import ROOT, TOPICS

CONTRACT = json.loads((ROOT / 'data/contracts/events/market.commerce.v1.schema.json').read_text())
VALIDATOR = Draft202012Validator(CONTRACT, format_checker=FormatChecker())


def parse_record(topic, partition, offset, key, raw, kafka_timestamp, ingested_at=None):
    timestamp = ingested_at or datetime.now(UTC)
    transport = f'{topic}:{partition}:{offset}'
    result = dict(transport_id=transport, topic=topic, partition=int(partition), offset=int(offset),  # noqa: C408
        kafka_key=key, kafka_timestamp=kafka_timestamp.isoformat(), raw_payload=raw,
        ingested_at=timestamp.isoformat(), event_id=None, event_type=None, event_version=None,
        occurred_at=None, business_identity=transport, parsing_status='INVALID', error_code=None, late=False)
    try:
        doc = json.loads(raw)
        if not isinstance(doc, dict):
            raise ValueError('INVALID_JSON_OBJECT')  # noqa: TRY004 -- contract validation code
        result.update(event_id=doc.get('event_id') if isinstance(doc.get('event_id'), str) else None,
            event_type=doc.get('event_type') if isinstance(doc.get('event_type'), str) else None,
            event_version=doc.get('version') if type(doc.get('version')) is int and -2147483648 <= doc['version'] <= 2147483647 else None,
            occurred_at=doc.get('occurred_at') if isinstance(doc.get('occurred_at'), str) else None)
        if topic not in TOPICS or topic != 'market.' + str(doc.get('source')) + '.v1':
            raise ValueError('SOURCE_TOPIC_MISMATCH')
        if type(doc.get('version')) is not int or doc['version'] != 1:
            raise ValueError('UNKNOWN_EVENT_VERSION')
        if list(VALIDATOR.iter_errors(doc)):
            raise ValueError('ENVELOPE_SCHEMA_INVALID')
        result['business_identity'] = str(UUID(doc['event_id']))
        occurred = datetime.fromisoformat(doc['occurred_at'])
        result.update(parsing_status='VALID', late=(timestamp - occurred).total_seconds() > 300)
    except (ValueError, TypeError, OverflowError) as exc:
        result['error_code'] = str(exc) if isinstance(exc, ValueError) and str(exc).isupper() else 'JSON_PARSE_INVALID'
    # Bounded diagnostics never reproduce malformed secrets into logs.
    return result
