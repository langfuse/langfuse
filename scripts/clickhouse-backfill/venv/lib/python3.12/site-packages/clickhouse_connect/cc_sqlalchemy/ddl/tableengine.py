import logging
from typing import Type, Sequence, Optional, Dict

from sqlalchemy.exc import ArgumentError, SQLAlchemyError
from sqlalchemy.sql.base import SchemaEventTarget
from sqlalchemy.sql.visitors import Visitable

logger = logging.getLogger(__name__)

engine_map: Dict[str, Type['TableEngine']] = {}


def tuple_expr(expr_name, value):
    """
    Create a table parameter with a tuple or list correctly formatted
    :param expr_name: parameter
    :param value: string or tuple of strings to format
    :return: formatted parameter string
    """
    if value is None:
        return ''
    v = f'{expr_name.strip()}'
    if isinstance(value, (tuple, list)):
        return f" {v} ({','.join(value)})"
    return f'{v} {value}'


class TableEngine(SchemaEventTarget, Visitable):
    """
    SqlAlchemy Schema element to support ClickHouse table engines.  At the moment provides no real
    functionality other than the CREATE TABLE argument string
    """
    arg_names = ()
    quoted_args = set()
    optional_args = set()
    eng_params = ()

    def __init_subclass__(cls, **kwargs):
        engine_map[cls.__name__] = cls

    def __init__(self, kwargs):
        # pylint: disable=no-value-for-parameter
        Visitable.__init__(self)
        self.name = self.__class__.__name__
        te_name = f'{self.name} Table Engine'
        engine_args = []
        for arg_name in self.arg_names:
            v = kwargs.pop(arg_name, None)
            if v is None:
                if arg_name in self.optional_args:
                    continue
                raise ValueError(f'Required engine parameter {arg_name} not provided for {te_name}')
            if arg_name in self.quoted_args:
                engine_args.append(f"'{v}'")
            else:
                engine_args.append(v)
        if engine_args:
            self.arg_str = f'({", ".join(engine_args)})'
        params = []
        for param_name in self.eng_params:
            v = kwargs.pop(param_name, None)
            if v is not None:
                params.append(tuple_expr(param_name.upper().replace('_', ' '), v))

        self.full_engine = 'Engine ' + self.name
        if engine_args:
            self.full_engine += f'({", ".join(engine_args)})'
        if params:
            self.full_engine += ' ' + ' '.join(params)

    def compile(self):
        return self.full_engine

    def check_primary_keys(self, primary_keys: Sequence):
        raise SQLAlchemyError(f'Table Engine {self.name} does not support primary keys')

    def _set_parent(self, parent, **_kwargs):
        parent.engine = self


class Memory(TableEngine):
    pass


class Log(TableEngine):
    pass


class StripeLog(TableEngine):
    pass


class TinyLog(TableEngine):
    pass


class Null(TableEngine):
    pass


class Set(TableEngine):
    pass


class Dictionary(TableEngine):
    arg_names = ['dictionary']

    # pylint: disable=unused-argument
    def __init__(self, dictionary: str = None):
        super().__init__(locals())


class Merge(TableEngine):
    arg_names = ['db_name, tables_regexp']

    # pylint: disable=unused-argument
    def __init__(self, db_name: str = None, tables_regexp: str = None):
        super().__init__(locals())


class File(TableEngine):
    arg_names = ['fmt']

    # pylint: disable=unused-argument
    def __init__(self, fmt: str = None):
        super().__init__(locals())


class Distributed(TableEngine):
    arg_names = ['cluster', 'database', 'table', 'sharding_key', 'policy_name']
    optional_args = {'sharding_key', 'policy_name'}

    # pylint: disable=unused-argument
    def __init__(self, cluster: str = None, database: str = None, table=None,
                 sharding_key: str = None, policy_name: str = None):
        super().__init__(locals())


class MergeTree(TableEngine):
    eng_params = ['order_by', 'partition_key', 'primary_key', 'sample_by']

    # pylint: disable=unused-argument
    def __init__(self, order_by: str = None, primary_key: str = None,
                 partition_by: str = None, sample_by: str = None):
        if not order_by and not primary_key:
            raise ArgumentError(None, 'Either PRIMARY KEY or ORDER BY must be specified')
        super().__init__(locals())


class SharedMergeTree(MergeTree):
    pass


class SummingMergeTree(MergeTree):
    pass


class AggregatingMergeTree(MergeTree):
    pass


class ReplacingMergeTree(TableEngine):
    arg_names = ['ver']
    optional_args = set(arg_names)
    eng_params = MergeTree.eng_params

    # pylint: disable=unused-argument
    def __init__(self, ver: str = None, order_by: str = None, primary_key: str = None,
                 partition_by: str = None, sample_by: str = None):
        if not order_by and not primary_key:
            raise ArgumentError(None, 'Either PRIMARY KEY or ORDER BY must be specified')
        super().__init__(locals())


class CollapsingMergeTree(TableEngine):
    arg_names = ['sign']
    eng_params = MergeTree.eng_params

    # pylint: disable=unused-argument
    def __init__(self, sign: str = None, order_by: str = None, primary_key: str = None,
                 partition_by: str = None, sample_by: str = None):
        if not order_by and not primary_key:
            raise ArgumentError(None, 'Either PRIMARY KEY or ORDER BY must be specified')
        super().__init__(locals())


class VersionedCollapsingMergeTree(TableEngine):
    arg_names = ['sign', 'version']
    eng_params = MergeTree.eng_params

    # pylint: disable=unused-argument
    def __init__(self, sign: str = None, version: str = None, order_by: str = None, primary_key: str = None,
                 partition_by: str = None, sample_by: str = None):
        if not order_by and not primary_key:
            raise ArgumentError(None, 'Either PRIMARY KEY or ORDER BY must be specified')
        super().__init__(locals())


class GraphiteMergeTree(TableEngine):
    arg_names = ['config_section']
    eng_params = MergeTree.eng_params

    # pylint: disable=unused-argument
    def __init__(self, config_section: str = None, version: str = None, order_by: str = None, primary_key: str = None,
                 partition_by: str = None, sample_by: str = None):
        if not order_by and not primary_key:
            raise ArgumentError(None, 'Either PRIMARY KEY or ORDER BY must be specified')
        super().__init__(locals())


class ReplicatedMergeTree(TableEngine):
    arg_names = ['zk_path', 'replica']
    quoted_args = set(arg_names)
    optional_args = quoted_args
    eng_params = MergeTree.eng_params

    # pylint: disable=unused-argument
    def __init__(self, order_by: str = None, primary_key: str = None, partition_by: str = None, sample_by: str = None,
                 zk_path: str = None, replica: str = None):
        if not order_by and not primary_key:
            raise ArgumentError(None, 'Either PRIMARY KEY or ORDER BY must be specified')
        super().__init__(locals())


class ReplicatedAggregatingMergeTree(ReplicatedMergeTree):
    pass


class ReplicatedSummingMergeTree(ReplicatedMergeTree):
    pass


class SharedReplacingMergeTree(ReplacingMergeTree):
    pass


class SharedAggregatingMergeTree(AggregatingMergeTree):
    pass


class SharedSummingMergeTree(SummingMergeTree):
    pass


class SharedVersionedCollapsingMergeTree(VersionedCollapsingMergeTree):
    pass


class SharedGraphiteMergeTree(GraphiteMergeTree):
    pass


def build_engine(full_engine: str) -> Optional[TableEngine]:
    """
    Factory function to create TableEngine class from ClickHouse full_engine expression
    :param full_engine
    :return: TableEngine DDL element
    """
    if not full_engine:
        return None
    name = full_engine.split(' ')[0].split('(')[0]
    try:
        engine_cls = engine_map[name]
    except KeyError:
        if not name.startswith('System'):
            logger.warning('Engine %s not found', name)
        return None
    engine = engine_cls.__new__(engine_cls)
    engine.name = name
    engine.full_engine = full_engine
    return engine
