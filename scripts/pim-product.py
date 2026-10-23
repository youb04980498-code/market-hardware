"""Approve a PIM revision after editing its fields through UnoPim UI or REST."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from market_catalog.pim import UnoPim

parser = argparse.ArgumentParser()
parser.add_argument('sku')
args = parser.parse_args()
pim = UnoPim()
try:
    product = pim.approve(args.sku)
    print(f"Approved product_id={product['product_id']} source_revision={product['source_revision']} publication_version={product['publication_version']}")
finally:
    pim.close()
