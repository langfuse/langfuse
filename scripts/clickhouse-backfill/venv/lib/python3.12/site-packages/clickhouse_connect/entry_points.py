#!/usr/bin/env python3

# This script is used for validating installed entrypoints.  Note that it fails on Python 3.7
import sys

from importlib.metadata import PackageNotFoundError, distribution

EXPECTED_EPS = {'sqlalchemy.dialects:clickhousedb',
                'sqlalchemy.dialects:clickhousedb.connect'}


def validate_entrypoints():
    expected_eps = EXPECTED_EPS.copy()
    try:
        dist = distribution('clickhouse-connect')
    except PackageNotFoundError:
        print ('\nClickHouse Connect package not found in this Python installation')
        return -1
    print()
    for entry_point in dist.entry_points:
        name = f'{entry_point.group}:{entry_point.name}'
        print(f'    {name}={entry_point.value}')
        try:
            expected_eps.remove(name)
        except KeyError:
            print (f'\nUnexpected entry point {name} found')
            return -1
    if expected_eps:
        print()
        for name in expected_eps:
            print (f'Did not find expected ep {name}')
        return -1
    print ('\nEntrypoints correctly installed')
    return 0


if __name__ == '__main__':
    sys.exit(validate_entrypoints())
