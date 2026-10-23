"""Compose entry point is python -m market_catalog.sync; shared code avoids duplicate mappings."""
from market_catalog.sync import main

if __name__ == '__main__':
    main()
