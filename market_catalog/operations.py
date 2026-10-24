"""Staff-only read model of the existing PIM worker. No authoring credentials here."""
from datetime import UTC, datetime

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer

from market_catalog.config import settings

bearer = HTTPBearer(auto_error=False)
BEARER = Depends(bearer)


def staff(credentials=BEARER):
    if credentials is None:
        raise HTTPException(401, 'Authentication required')
    try:
        response = httpx.get(settings().get('AUTH_URL', 'http://auth:8080') + '/api/auth/me',
            headers={'Authorization': 'Bearer ' + credentials.credentials}, timeout=5, trust_env=False)
    except httpx.HTTPError:
        raise HTTPException(503, 'Authentication service unavailable') from None
    if response.status_code in (401, 403):
        raise HTTPException(401, 'Active session required')
    if response.status_code != 200:
        raise HTTPException(503, 'Authentication service unavailable')
    user = response.json()
    if not set(user.get('roles', [])) & {'admin', 'staff'}:
        raise HTTPException(403, 'Staff access required')
    return user


def summary(db, now=None):
    now = now or datetime.now(UTC)
    source = db.sync_status.find_one({'_id': 'authoring'})
    worker = db.sync_status.find_one({'_id': 'worker'})
    observed = source.get('observed_at') if source else None
    source_stale = not observed or (now - observed).total_seconds() > 120
    worker_stale = not worker or (now - worker['checked_at']).total_seconds() > 120
    rejected = set(source.get('rejected_product_ids', [])) if source else set()
    # Current errors, not the cumulative historical error log or compensated jobs.
    rejected.update(str(r['product_id']) for r in db.sync_jobs.find({'state': 'ERROR'}, {'product_id': 1}))
    return {'author_total': source['author_total'] if source else None,
        'managed_total': source['managed_total'] if source else None,
        'unapproved_total': source['unapproved_total'] if source else None,
        'published_active': db.products.count_documents({'active': True, 'sync_state': 'READY'}),
        'published_inactive': db.products.count_documents({'active': False, 'sync_state': 'READY'}),
        'pending_jobs': db.sync_jobs.count_documents({'state': 'PENDING'}),
        'publication_errors': len(rejected) if source else None,
        'pim_observed_at': observed, 'observed_at': now,
        'pim_connected': not source_stale,
        'worker_healthy': not worker_stale and worker.get('failures', 1) == 0,
        'stale': source_stale or worker_stale,
        'source': 'UnoPim REST enumeration by product-sync; persisted jobs in MongoDB',
        'definitions': {'author_total': 'All authoring products, including inactive/unmanaged products.',
            'pending_jobs': 'Persisted PENDING jobs. Unapproved drafts are counted separately.',
            'publication_errors': 'Distinct products rejected in the latest complete scan or in a current ERROR job; historical errors are excluded.'}}


STAFF = Depends(staff)


def register(app):
    @app.get('/api/catalog/operations')
    def operations(user=STAFF):
        return summary(app.state.client.market_catalog)
