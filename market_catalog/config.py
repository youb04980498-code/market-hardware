import os
from pathlib import Path

from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]


def settings():
    return {**dotenv_values(ROOT / '.env'), **os.environ}


def mongo(access='sync'):
    env = settings()
    prefix = 'MONGO_CATALOG_READ' if access == 'read' else 'MONGO_CATALOG_SYNC'
    return MongoClient(env.get('MONGO_HOST', '127.0.0.1'),
                       username=env[prefix + '_USER'], password=env[prefix + '_PASSWORD'],
                       authSource='market_catalog', tz_aware=True, serverSelectionTimeoutMS=10000)
