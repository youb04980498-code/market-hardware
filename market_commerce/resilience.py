"""Process-local dependency isolation. Durable business retries remain in the Saga."""
import threading
import time
from contextlib import contextmanager


class DependencyUnavailable(Exception):
    pass


class Circuit:
    def __init__(self, failures=5, cooldown=15, concurrency=8, clock=time.monotonic):
        self.threshold, self.cooldown, self.clock = failures, cooldown, clock
        self.pool = threading.BoundedSemaphore(concurrency)
        self.lock = threading.Lock()
        self.failures = 0
        self.opened = None
        self.probing = False

    @property
    def state(self):
        if self.opened is None:
            return 'CLOSED'
        return 'HALF_OPEN' if self.clock() - self.opened >= self.cooldown else 'OPEN'

    @contextmanager
    def call(self):
        if not self.pool.acquire(blocking=False):
            raise DependencyUnavailable('BULKHEAD_FULL')
        admitted = False
        try:
            with self.lock:
                state = self.state
                if state == 'OPEN' or (state == 'HALF_OPEN' and self.probing):
                    raise DependencyUnavailable('CIRCUIT_OPEN')
                self.probing = state == 'HALF_OPEN'
                admitted = True
            try:
                yield
            except Exception:
                with self.lock:
                    self.failures += 1
                    if self.probing or self.failures >= self.threshold:
                        self.opened = self.clock()
                raise
            else:
                with self.lock:
                    self.failures, self.opened = 0, None
        finally:
            if admitted:
                with self.lock:
                    self.probing = False
            self.pool.release()


CIRCUITS = {}
LOCK = threading.Lock()


def circuit(target):
    with LOCK:
        return CIRCUITS.setdefault(target, Circuit())
