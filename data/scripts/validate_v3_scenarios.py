"""Offline V3 fixture checks, not a production solver or checkout service."""
from collections import Counter


REQUIRED = {
    'CPU': ('socket', 'tdp_w'),
    'MOTHERBOARD': ('socket', 'memory_type', 'form_factor', 'm2_slots', 'sata_ports'),
    'RAM': ('memory_type', 'capacity_gb', 'modules'),
    'GPU': ('length_mm', 'board_power_w', 'power_connectors'),
    'PSU': ('wattage_w', 'gpu_connectors'),
    'CASE': ('motherboard_forms', 'max_gpu_length_mm', 'max_cooler_height_mm'),
    'COOLER': ('height_mm', 'sockets', 'cooling_capacity_w'),
    'SSD': ('interface',),
}


def assess(case, build, products, stock, compatibility_error):
    components = build['components']
    overrides = case.get('override_attributes', {})
    for category, keys in REQUIRED.items():
        attributes = dict(products[components[category]]['attributes'])
        attributes.update(overrides.get(category, {}))
        if any(attributes.get(key) in (None, '') for key in keys):
            return {'status': 'UNKNOWN_SPECIFICATION'}

    firmware = case.get('firmware', {})
    pair = (components['CPU'], components['MOTHERBOARD'])
    if (firmware.get('validation_status') != 'SYNTHETIC_VERIFIED'
            or not firmware.get('source')
            or (firmware.get('cpu_id'), firmware.get('motherboard_id')) != pair
            or firmware.get('installed_revision') is None
            or firmware.get('minimum_revision') is None):
        return {'status': 'UNKNOWN_BIOS'}
    # Revisions are ordered synthetic integers, not real vendor BIOS strings.
    if firmware['installed_revision'] < firmware['minimum_revision']:
        return {'status': 'BIOS_UPDATE_REQUIRED'}
    error = compatibility_error(components, overrides=overrides)
    if error:
        return {'status': error}

    quantities = Counter(components.values())
    prices = case.get('current_prices_cents', {})
    available = case.get('current_available', {})
    total = 0
    changed = False
    for product_id, quantity in quantities.items():
        product = products[product_id]
        current_stock = available.get(str(product_id), sum(
            int(row['quantity']) - int(row['reserved_quantity'])
            for (pid, _), row in stock.items() if pid == product_id))
        if not product['active'] or current_stock < quantity:
            return {'status': 'STOCK_UNAVAILABLE'}
        price = prices.get(str(product_id), product['price_cents'])
        if type(price) is not int or price < 0:
            return {'status': 'INVALID_PRICE'}
        changed |= price != product['price_cents']
        total += price * quantity
    budget = case.get('budget_cents', build['budget_cents'])
    status = 'BUDGET_EXCEEDED' if total > budget else (
        'REQUOTE_REQUIRED' if changed else 'READY')
    return {'status': status, 'total_cents': total, 'remaining_cents': budget - total}


def validate_scenarios(cases, builds, products, stock, compatibility_error):
    by_build = {build['build_id']: build for build in builds}
    assert len({case['case_id'] for case in cases}) == len(cases)
    for case in cases:
        actual = assess(case, by_build[case['build_id']], products, stock, compatibility_error)
        assert all(actual.get(key) == value for key, value in case['expected'].items()), (
            case['case_id'], case['expected'], actual)
    required = {'UNKNOWN_SPECIFICATION', 'UNKNOWN_BIOS', 'BIOS_UPDATE_REQUIRED',
                'READY', 'BUDGET_EXCEEDED', 'REQUOTE_REQUIRED', 'STOCK_UNAVAILABLE'}
    assert required <= {case['expected']['status'] for case in cases}
